﻿/* Tern web worker, which is used by default
 * This file also contains all files that are needed for the web worker to run (the server can load files on demand, but its messy to have all these files for once peice of ace functionality)
 * 
 * TODO
 * 
 * Add support for node.js and require.js plugins
 * 
 */

// declare global: tern, server

var server;

this.onmessage = function (e) {
    //console.log('onmessage');
    var data = e.data;
    switch (data.type) {
        case "init":
            //GHETTO QUICK HACK- get def from name at bottom of this file so it doesnt have to be included in ext-tern.js file
            if (data.defs && data.defs.length > 0) {
                var tmp = [];
                for(var i=0; i< data.defs.length; i++){
                    tmp.push(getDefFromName(data.defs[i]));
                }
                data.defs = tmp;
            }
            return startServer(data.defs, data.plugins, data.scripts);
        case "add": return server.addFile(data.name, data.text);
        case "del": return server.delFile(data.name);
        case "req": return server.request(data.body, function (err, reqData) {
            postMessage({ id: data.id, body: reqData, err: err && String(err) });
        });
        case "getFile":
            var c = pending[data.id];
            delete pending[data.id];
            return c(data.err, data.text);
        case "setDefs": return setDefs(data.defs);
        default: throw new Error("Unknown message type: " + data.type);
    }
    //Added for ace- sets defs as setting them on load is not ideal due to structure and the defs are stored in the worker file
    function setDefs(defs) {                
        console.log('set defs in worker-tern.js does not work yet... it gets the file but setting the servers defs property is not enough to load the defs- this needs to be updated in tern to allow setting defs after load');
        try {
            server.defs = [];
            if (!defs || defs.length == 0) { return; }                        
            for (var i=0; i< defs.length; i++){                     
                server.defs.push(getDefFromName(defs[i]));
                console.log(server.defs);
            }
            
        }
        catch (ex) {
            console.log('error setting tern defs (should be passed array) error: ' + ex);
        }
    }
    //(hack)- gets def from name at the bottom of this file (jquery,ecma5,browser,underscore)
    function getDefFromName(name) {
        return eval('def_' + name);
    }
};

var nextId = 0, pending = {};
function getFile(file, c) {
    console.log('getFile');
    postMessage({ type: "getFile", name: file, id: ++nextId });
    pending[nextId] = c;
}

function startServer(defs, plugins, scripts) {
    console.log('startServer');
    if (scripts) importScripts.apply(null, scripts);

    server = new tern.Server({
        getFile: getFile,
        async: true,
        defs: defs,
        plugins: plugins
    });
}

var console = {
    log: function (v) { postMessage({ type: "debug", message: v }); }
};











//#region acorn/acorn.js

// Acorn is a tiny, fast JavaScript parser written in JavaScript.
//
// Acorn was written by Marijn Haverbeke and released under an MIT
// license. The Unicode regexps (for identifiers and whitespace) were
// taken from [Esprima](http://esprima.org) by Ariya Hidayat.
//
// Git repositories for Acorn are available at
//
//     http://marijnhaverbeke.nl/git/acorn
//     https://github.com/marijnh/acorn.git
//
// Please use the [github bug tracker][ghbt] to report issues.
//
// [ghbt]: https://github.com/marijnh/acorn/issues
//
// This file defines the main parser interface. The library also comes
// with a [error-tolerant parser][dammit] and an
// [abstract syntax tree walker][walk], defined in other files.
//
// [dammit]: acorn_loose.js
// [walk]: util/walk.js

(function (root, mod) {
    if (typeof exports == "object" && typeof module == "object") return mod(exports); // CommonJS
    if (typeof define == "function" && define.amd) return define(["exports"], mod); // AMD
    mod(root.acorn || (root.acorn = {})); // Plain browser env
})(this, function (exports) {
    "use strict";

    exports.version = "0.5.0";

    // The main exported interface (under `self.acorn` when in the
    // browser) is a `parse` function that takes a code string and
    // returns an abstract syntax tree as specified by [Mozilla parser
    // API][api], with the caveat that the SpiderMonkey-specific syntax
    // (`let`, `yield`, inline XML, etc) is not recognized.
    //
    // [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API

    var options, input, inputLen, sourceFile;

    exports.parse = function (inpt, opts) {
        input = String(inpt); inputLen = input.length;
        setOptions(opts);
        initTokenState();
        return parseTopLevel(options.program);
    };

    // A second optional argument can be given to further configure
    // the parser process. These options are recognized:

    var defaultOptions = exports.defaultOptions = {
        // `ecmaVersion` indicates the ECMAScript version to parse. Must
        // be either 3 or 5. This
        // influences support for strict mode, the set of reserved words, and
        // support for getters and setter.
        ecmaVersion: 5,
        // Turn on `strictSemicolons` to prevent the parser from doing
        // automatic semicolon insertion.
        strictSemicolons: false,
        // When `allowTrailingCommas` is false, the parser will not allow
        // trailing commas in array and object literals.
        allowTrailingCommas: true,
        // By default, reserved words are not enforced. Enable
        // `forbidReserved` to enforce them. When this option has the
        // value "everywhere", reserved words and keywords can also not be
        // used as property names.
        forbidReserved: false,
        // When enabled, a return at the top level is not considered an
        // error.
        allowReturnOutsideFunction: false,
        // When `locations` is on, `loc` properties holding objects with
        // `start` and `end` properties in `{line, column}` form (with
        // line being 1-based and column 0-based) will be attached to the
        // nodes.
        locations: false,
        // A function can be passed as `onComment` option, which will
        // cause Acorn to call that function with `(block, text, start,
        // end)` parameters whenever a comment is skipped. `block` is a
        // boolean indicating whether this is a block (`/* */`) comment,
        // `text` is the content of the comment, and `start` and `end` are
        // character offsets that denote the start and end of the comment.
        // When the `locations` option is on, two more parameters are
        // passed, the full `{line, column}` locations of the start and
        // end of the comments. Note that you are not allowed to call the
        // parser from the callback—that will corrupt its internal state.
        onComment: null,
        // Nodes have their start and end characters offsets recorded in
        // `start` and `end` properties (directly on the node, rather than
        // the `loc` object, which holds line/column data. To also add a
        // [semi-standardized][range] `range` property holding a `[start,
        // end]` array with the same numbers, set the `ranges` option to
        // `true`.
        //
        // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
        ranges: false,
        // It is possible to parse multiple files into a single AST by
        // passing the tree produced by parsing the first file as
        // `program` option in subsequent parses. This will add the
        // toplevel forms of the parsed file to the `Program` (top) node
        // of an existing parse tree.
        program: null,
        // When `locations` is on, you can pass this to record the source
        // file in every node's `loc` object.
        sourceFile: null,
        // This value, if given, is stored in every node, whether
        // `locations` is on or off.
        directSourceFile: null
    };

    function setOptions(opts) {
        options = opts || {};
        for (var opt in defaultOptions) if (!Object.prototype.hasOwnProperty.call(options, opt))
            options[opt] = defaultOptions[opt];
        sourceFile = options.sourceFile || null;
    }

    // The `getLineInfo` function is mostly useful when the
    // `locations` option is off (for performance reasons) and you
    // want to find the line/column position for a given character
    // offset. `input` should be the code string that the offset refers
    // into.

    var getLineInfo = exports.getLineInfo = function (input, offset) {
        for (var line = 1, cur = 0; ;) {
            lineBreak.lastIndex = cur;
            var match = lineBreak.exec(input);
            if (match && match.index < offset) {
                ++line;
                cur = match.index + match[0].length;
            } else break;
        }
        return { line: line, column: offset - cur };
    };

    // Acorn is organized as a tokenizer and a recursive-descent parser.
    // The `tokenize` export provides an interface to the tokenizer.
    // Because the tokenizer is optimized for being efficiently used by
    // the Acorn parser itself, this interface is somewhat crude and not
    // very modular. Performing another parse or call to `tokenize` will
    // reset the internal state, and invalidate existing tokenizers.

    exports.tokenize = function (inpt, opts) {
        input = String(inpt); inputLen = input.length;
        setOptions(opts);
        initTokenState();

        var t = {};
        function getToken(forceRegexp) {
            lastEnd = tokEnd;
            readToken(forceRegexp);
            t.start = tokStart; t.end = tokEnd;
            t.startLoc = tokStartLoc; t.endLoc = tokEndLoc;
            t.type = tokType; t.value = tokVal;
            return t;
        }
        getToken.jumpTo = function (pos, reAllowed) {
            tokPos = pos;
            if (options.locations) {
                tokCurLine = 1;
                tokLineStart = lineBreak.lastIndex = 0;
                var match;
                while ((match = lineBreak.exec(input)) && match.index < pos) {
                    ++tokCurLine;
                    tokLineStart = match.index + match[0].length;
                }
            }
            tokRegexpAllowed = reAllowed;
            skipSpace();
        };
        return getToken;
    };

    // State is kept in (closure-)global variables. We already saw the
    // `options`, `input`, and `inputLen` variables above.

    // The current position of the tokenizer in the input.

    var tokPos;

    // The start and end offsets of the current token.

    var tokStart, tokEnd;

    // When `options.locations` is true, these hold objects
    // containing the tokens start and end line/column pairs.

    var tokStartLoc, tokEndLoc;

    // The type and value of the current token. Token types are objects,
    // named by variables against which they can be compared, and
    // holding properties that describe them (indicating, for example,
    // the precedence of an infix operator, and the original name of a
    // keyword token). The kind of value that's held in `tokVal` depends
    // on the type of the token. For literals, it is the literal value,
    // for operators, the operator name, and so on.

    var tokType, tokVal;

    // Interal state for the tokenizer. To distinguish between division
    // operators and regular expressions, it remembers whether the last
    // token was one that is allowed to be followed by an expression.
    // (If it is, a slash is probably a regexp, if it isn't it's a
    // division operator. See the `parseStatement` function for a
    // caveat.)

    var tokRegexpAllowed;

    // When `options.locations` is true, these are used to keep
    // track of the current line, and know when a new line has been
    // entered.

    var tokCurLine, tokLineStart;

    // These store the position of the previous token, which is useful
    // when finishing a node and assigning its `end` position.

    var lastStart, lastEnd, lastEndLoc;

    // This is the parser's state. `inFunction` is used to reject
    // `return` statements outside of functions, `labels` to verify that
    // `break` and `continue` have somewhere to jump to, and `strict`
    // indicates whether strict mode is on.

    var inFunction, labels, strict;

    // This function is used to raise exceptions on parse errors. It
    // takes an offset integer (into the current `input`) to indicate
    // the location of the error, attaches the position to the end
    // of the error message, and then raises a `SyntaxError` with that
    // message.

    function raise(pos, message) {
        var loc = getLineInfo(input, pos);
        message += " (" + loc.line + ":" + loc.column + ")";
        var err = new SyntaxError(message);
        err.pos = pos; err.loc = loc; err.raisedAt = tokPos;
        throw err;
    }

    // Reused empty array added for node fields that are always empty.

    var empty = [];

    // ## Token types

    // The assignment of fine-grained, information-carrying type objects
    // allows the tokenizer to store the information it has about a
    // token in a way that is very cheap for the parser to look up.

    // All token type variables start with an underscore, to make them
    // easy to recognize.

    // These are the general types. The `type` property is only used to
    // make them recognizeable when debugging.

    var _num = { type: "num" }, _regexp = { type: "regexp" }, _string = { type: "string" };
    var _name = { type: "name" }, _eof = { type: "eof" };

    // Keyword tokens. The `keyword` property (also used in keyword-like
    // operators) indicates that the token originated from an
    // identifier-like word, which is used when parsing property names.
    //
    // The `beforeExpr` property is used to disambiguate between regular
    // expressions and divisions. It is set on all token types that can
    // be followed by an expression (thus, a slash after them would be a
    // regular expression).
    //
    // `isLoop` marks a keyword as starting a loop, which is important
    // to know when parsing a label, in order to allow or disallow
    // continue jumps to that label.

    var _break = { keyword: "break" }, _case = { keyword: "case", beforeExpr: true }, _catch = { keyword: "catch" };
    var _continue = { keyword: "continue" }, _debugger = { keyword: "debugger" }, _default = { keyword: "default" };
    var _do = { keyword: "do", isLoop: true }, _else = { keyword: "else", beforeExpr: true };
    var _finally = { keyword: "finally" }, _for = { keyword: "for", isLoop: true }, _function = { keyword: "function" };
    var _if = { keyword: "if" }, _return = { keyword: "return", beforeExpr: true }, _switch = { keyword: "switch" };
    var _throw = { keyword: "throw", beforeExpr: true }, _try = { keyword: "try" }, _var = { keyword: "var" };
    var _while = { keyword: "while", isLoop: true }, _with = { keyword: "with" }, _new = { keyword: "new", beforeExpr: true };
    var _this = { keyword: "this" };

    // The keywords that denote values.

    var _null = { keyword: "null", atomValue: null }, _true = { keyword: "true", atomValue: true };
    var _false = { keyword: "false", atomValue: false };

    // Some keywords are treated as regular operators. `in` sometimes
    // (when parsing `for`) needs to be tested against specifically, so
    // we assign a variable name to it for quick comparing.

    var _in = { keyword: "in", binop: 7, beforeExpr: true };

    // Map keyword names to token types.

    var keywordTypes = {
        "break": _break, "case": _case, "catch": _catch,
        "continue": _continue, "debugger": _debugger, "default": _default,
        "do": _do, "else": _else, "finally": _finally, "for": _for,
        "function": _function, "if": _if, "return": _return, "switch": _switch,
        "throw": _throw, "try": _try, "var": _var, "while": _while, "with": _with,
        "null": _null, "true": _true, "false": _false, "new": _new, "in": _in,
        "instanceof": { keyword: "instanceof", binop: 7, beforeExpr: true }, "this": _this,
        "typeof": { keyword: "typeof", prefix: true, beforeExpr: true },
        "void": { keyword: "void", prefix: true, beforeExpr: true },
        "delete": { keyword: "delete", prefix: true, beforeExpr: true }
    };

    // Punctuation token types. Again, the `type` property is purely for debugging.

    var _bracketL = { type: "[", beforeExpr: true }, _bracketR = { type: "]" }, _braceL = { type: "{", beforeExpr: true };
    var _braceR = { type: "}" }, _parenL = { type: "(", beforeExpr: true }, _parenR = { type: ")" };
    var _comma = { type: ",", beforeExpr: true }, _semi = { type: ";", beforeExpr: true };
    var _colon = { type: ":", beforeExpr: true }, _dot = { type: "." }, _question = { type: "?", beforeExpr: true };

    // Operators. These carry several kinds of properties to help the
    // parser use them properly (the presence of these properties is
    // what categorizes them as operators).
    //
    // `binop`, when present, specifies that this operator is a binary
    // operator, and will refer to its precedence.
    //
    // `prefix` and `postfix` mark the operator as a prefix or postfix
    // unary operator. `isUpdate` specifies that the node produced by
    // the operator should be of type UpdateExpression rather than
    // simply UnaryExpression (`++` and `--`).
    //
    // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
    // binary operators with a very low precedence, that should result
    // in AssignmentExpression nodes.

    var _slash = { binop: 10, beforeExpr: true }, _eq = { isAssign: true, beforeExpr: true };
    var _assign = { isAssign: true, beforeExpr: true };
    var _incDec = { postfix: true, prefix: true, isUpdate: true }, _prefix = { prefix: true, beforeExpr: true };
    var _logicalOR = { binop: 1, beforeExpr: true };
    var _logicalAND = { binop: 2, beforeExpr: true };
    var _bitwiseOR = { binop: 3, beforeExpr: true };
    var _bitwiseXOR = { binop: 4, beforeExpr: true };
    var _bitwiseAND = { binop: 5, beforeExpr: true };
    var _equality = { binop: 6, beforeExpr: true };
    var _relational = { binop: 7, beforeExpr: true };
    var _bitShift = { binop: 8, beforeExpr: true };
    var _plusMin = { binop: 9, prefix: true, beforeExpr: true };
    var _multiplyModulo = { binop: 10, beforeExpr: true };

    // Provide access to the token types for external users of the
    // tokenizer.

    exports.tokTypes = {
        bracketL: _bracketL, bracketR: _bracketR, braceL: _braceL, braceR: _braceR,
        parenL: _parenL, parenR: _parenR, comma: _comma, semi: _semi, colon: _colon,
        dot: _dot, question: _question, slash: _slash, eq: _eq, name: _name, eof: _eof,
        num: _num, regexp: _regexp, string: _string
    };
    for (var kw in keywordTypes) exports.tokTypes["_" + kw] = keywordTypes[kw];

    // This is a trick taken from Esprima. It turns out that, on
    // non-Chrome browsers, to check whether a string is in a set, a
    // predicate containing a big ugly `switch` statement is faster than
    // a regular expression, and on Chrome the two are about on par.
    // This function uses `eval` (non-lexical) to produce such a
    // predicate from a space-separated string of words.
    //
    // It starts by sorting the words by length.

    function makePredicate(words) {
        words = words.split(" ");
        var f = "", cats = [];
        out: for (var i = 0; i < words.length; ++i) {
            for (var j = 0; j < cats.length; ++j)
                if (cats[j][0].length == words[i].length) {
                    cats[j].push(words[i]);
                    continue out;
                }
            cats.push([words[i]]);
        }
        function compareTo(arr) {
            if (arr.length == 1) return f += "return str === " + JSON.stringify(arr[0]) + ";";
            f += "switch(str){";
            for (var i = 0; i < arr.length; ++i) f += "case " + JSON.stringify(arr[i]) + ":";
            f += "return true}return false;";
        }

        // When there are more than three length categories, an outer
        // switch first dispatches on the lengths, to save on comparisons.

        if (cats.length > 3) {
            cats.sort(function (a, b) { return b.length - a.length; });
            f += "switch(str.length){";
            for (var i = 0; i < cats.length; ++i) {
                var cat = cats[i];
                f += "case " + cat[0].length + ":";
                compareTo(cat);
            }
            f += "}";

            // Otherwise, simply generate a flat `switch` statement.

        } else {
            compareTo(words);
        }
        return new Function("str", f);
    }

    // The ECMAScript 3 reserved word list.

    var isReservedWord3 = makePredicate("abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile");

    // ECMAScript 5 reserved words.

    var isReservedWord5 = makePredicate("class enum extends super const export import");

    // The additional reserved words in strict mode.

    var isStrictReservedWord = makePredicate("implements interface let package private protected public static yield");

    // The forbidden variable names in strict mode.

    var isStrictBadIdWord = makePredicate("eval arguments");

    // And the keywords.

    var isKeyword = makePredicate("break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this");

    // ## Character categories

    // Big ugly regular expressions that match characters in the
    // whitespace, identifier, and identifier-start categories. These
    // are only applied when a character is found to actually have a
    // code point above 128.

    var nonASCIIwhitespace = /[\u1680\u180e\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
    var nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";
    var nonASCIIidentifierChars = "\u0300-\u036f\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u0620-\u0649\u0672-\u06d3\u06e7-\u06e8\u06fb-\u06fc\u0730-\u074a\u0800-\u0814\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0840-\u0857\u08e4-\u08fe\u0900-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962-\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09d7\u09df-\u09e0\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5f-\u0b60\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2-\u0ce3\u0ce6-\u0cef\u0d02\u0d03\u0d46-\u0d48\u0d57\u0d62-\u0d63\u0d66-\u0d6f\u0d82\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e34-\u0e3a\u0e40-\u0e45\u0e50-\u0e59\u0eb4-\u0eb9\u0ec8-\u0ecd\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f41-\u0f47\u0f71-\u0f84\u0f86-\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1029\u1040-\u1049\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u170e-\u1710\u1720-\u1730\u1740-\u1750\u1772\u1773\u1780-\u17b2\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1920-\u192b\u1930-\u193b\u1951-\u196d\u19b0-\u19c0\u19c8-\u19c9\u19d0-\u19d9\u1a00-\u1a15\u1a20-\u1a53\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1b46-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1bb0-\u1bb9\u1be6-\u1bf3\u1c00-\u1c22\u1c40-\u1c49\u1c5b-\u1c7d\u1cd0-\u1cd2\u1d00-\u1dbe\u1e01-\u1f15\u200c\u200d\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2d81-\u2d96\u2de0-\u2dff\u3021-\u3028\u3099\u309a\ua640-\ua66d\ua674-\ua67d\ua69f\ua6f0-\ua6f1\ua7f8-\ua800\ua806\ua80b\ua823-\ua827\ua880-\ua881\ua8b4-\ua8c4\ua8d0-\ua8d9\ua8f3-\ua8f7\ua900-\ua909\ua926-\ua92d\ua930-\ua945\ua980-\ua983\ua9b3-\ua9c0\uaa00-\uaa27\uaa40-\uaa41\uaa4c-\uaa4d\uaa50-\uaa59\uaa7b\uaae0-\uaae9\uaaf2-\uaaf3\uabc0-\uabe1\uabec\uabed\uabf0-\uabf9\ufb20-\ufb28\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f";
    var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
    var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");

    // Whether a single character denotes a newline.

    var newline = /[\n\r\u2028\u2029]/;

    // Matches a whole line break (where CRLF is considered a single
    // line break). Used to count lines.

    var lineBreak = /\r\n|[\n\r\u2028\u2029]/g;

    // Test whether a given character code starts an identifier.

    var isIdentifierStart = exports.isIdentifierStart = function (code) {
        if (code < 65) return code === 36;
        if (code < 91) return true;
        if (code < 97) return code === 95;
        if (code < 123) return true;
        return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code));
    };

    // Test whether a given character is part of an identifier.

    var isIdentifierChar = exports.isIdentifierChar = function (code) {
        if (code < 48) return code === 36;
        if (code < 58) return true;
        if (code < 65) return false;
        if (code < 91) return true;
        if (code < 97) return code === 95;
        if (code < 123) return true;
        return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code));
    };

    // ## Tokenizer

    // These are used when `options.locations` is on, for the
    // `tokStartLoc` and `tokEndLoc` properties.

    function line_loc_t() {
        this.line = tokCurLine;
        this.column = tokPos - tokLineStart;
    }

    // Reset the token state. Used at the start of a parse.

    function initTokenState() {
        tokCurLine = 1;
        tokPos = tokLineStart = 0;
        tokRegexpAllowed = true;
        skipSpace();
    }

    // Called at the end of every token. Sets `tokEnd`, `tokVal`, and
    // `tokRegexpAllowed`, and skips the space after the token, so that
    // the next one's `tokStart` will point at the right position.

    function finishToken(type, val) {
        tokEnd = tokPos;
        if (options.locations) tokEndLoc = new line_loc_t;
        tokType = type;
        skipSpace();
        tokVal = val;
        tokRegexpAllowed = type.beforeExpr;
    }

    function skipBlockComment() {
        var startLoc = options.onComment && options.locations && new line_loc_t;
        var start = tokPos, end = input.indexOf("*/", tokPos += 2);
        if (end === -1) raise(tokPos - 2, "Unterminated comment");
        tokPos = end + 2;
        if (options.locations) {
            lineBreak.lastIndex = start;
            var match;
            while ((match = lineBreak.exec(input)) && match.index < tokPos) {
                ++tokCurLine;
                tokLineStart = match.index + match[0].length;
            }
        }
        if (options.onComment)
            options.onComment(true, input.slice(start + 2, end), start, tokPos,
                              startLoc, options.locations && new line_loc_t);
    }

    function skipLineComment() {
        var start = tokPos;
        var startLoc = options.onComment && options.locations && new line_loc_t;
        var ch = input.charCodeAt(tokPos += 2);
        while (tokPos < inputLen && ch !== 10 && ch !== 13 && ch !== 8232 && ch !== 8233) {
            ++tokPos;
            ch = input.charCodeAt(tokPos);
        }
        if (options.onComment)
            options.onComment(false, input.slice(start + 2, tokPos), start, tokPos,
                              startLoc, options.locations && new line_loc_t);
    }

    // Called at the start of the parse and after every token. Skips
    // whitespace and comments, and.

    function skipSpace() {
        while (tokPos < inputLen) {
            var ch = input.charCodeAt(tokPos);
            if (ch === 32) { // ' '
                ++tokPos;
            } else if (ch === 13) {
                ++tokPos;
                var next = input.charCodeAt(tokPos);
                if (next === 10) {
                    ++tokPos;
                }
                if (options.locations) {
                    ++tokCurLine;
                    tokLineStart = tokPos;
                }
            } else if (ch === 10 || ch === 8232 || ch === 8233) {
                ++tokPos;
                if (options.locations) {
                    ++tokCurLine;
                    tokLineStart = tokPos;
                }
            } else if (ch > 8 && ch < 14) {
                ++tokPos;
            } else if (ch === 47) { // '/'
                var next = input.charCodeAt(tokPos + 1);
                if (next === 42) { // '*'
                    skipBlockComment();
                } else if (next === 47) { // '/'
                    skipLineComment();
                } else break;
            } else if (ch === 160) { // '\xa0'
                ++tokPos;
            } else if (ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
                ++tokPos;
            } else {
                break;
            }
        }
    }

    // ### Token reading

    // This is the function that is called to fetch the next token. It
    // is somewhat obscure, because it works in character codes rather
    // than characters, and because operator parsing has been inlined
    // into it.
    //
    // All in the name of speed.
    //
    // The `forceRegexp` parameter is used in the one case where the
    // `tokRegexpAllowed` trick does not work. See `parseStatement`.

    function readToken_dot() {
        var next = input.charCodeAt(tokPos + 1);
        if (next >= 48 && next <= 57) return readNumber(true);
        ++tokPos;
        return finishToken(_dot);
    }

    function readToken_slash() { // '/'
        var next = input.charCodeAt(tokPos + 1);
        if (tokRegexpAllowed) { ++tokPos; return readRegexp(); }
        if (next === 61) return finishOp(_assign, 2);
        return finishOp(_slash, 1);
    }

    function readToken_mult_modulo() { // '%*'
        var next = input.charCodeAt(tokPos + 1);
        if (next === 61) return finishOp(_assign, 2);
        return finishOp(_multiplyModulo, 1);
    }

    function readToken_pipe_amp(code) { // '|&'
        var next = input.charCodeAt(tokPos + 1);
        if (next === code) return finishOp(code === 124 ? _logicalOR : _logicalAND, 2);
        if (next === 61) return finishOp(_assign, 2);
        return finishOp(code === 124 ? _bitwiseOR : _bitwiseAND, 1);
    }

    function readToken_caret() { // '^'
        var next = input.charCodeAt(tokPos + 1);
        if (next === 61) return finishOp(_assign, 2);
        return finishOp(_bitwiseXOR, 1);
    }

    function readToken_plus_min(code) { // '+-'
        var next = input.charCodeAt(tokPos + 1);
        if (next === code) {
            if (next == 45 && input.charCodeAt(tokPos + 2) == 62 &&
                newline.test(input.slice(lastEnd, tokPos))) {
                // A `-->` line comment
                tokPos += 3;
                skipLineComment();
                skipSpace();
                return readToken();
            }
            return finishOp(_incDec, 2);
        }
        if (next === 61) return finishOp(_assign, 2);
        return finishOp(_plusMin, 1);
    }

    function readToken_lt_gt(code) { // '<>'
        var next = input.charCodeAt(tokPos + 1);
        var size = 1;
        if (next === code) {
            size = code === 62 && input.charCodeAt(tokPos + 2) === 62 ? 3 : 2;
            if (input.charCodeAt(tokPos + size) === 61) return finishOp(_assign, size + 1);
            return finishOp(_bitShift, size);
        }
        if (next == 33 && code == 60 && input.charCodeAt(tokPos + 2) == 45 &&
            input.charCodeAt(tokPos + 3) == 45) {
            // `<!--`, an XML-style comment that should be interpreted as a line comment
            tokPos += 4;
            skipLineComment();
            skipSpace();
            return readToken();
        }
        if (next === 61)
            size = input.charCodeAt(tokPos + 2) === 61 ? 3 : 2;
        return finishOp(_relational, size);
    }

    function readToken_eq_excl(code) { // '=!'
        var next = input.charCodeAt(tokPos + 1);
        if (next === 61) return finishOp(_equality, input.charCodeAt(tokPos + 2) === 61 ? 3 : 2);
        return finishOp(code === 61 ? _eq : _prefix, 1);
    }

    function getTokenFromCode(code) {
        switch (code) {
            // The interpretation of a dot depends on whether it is followed
            // by a digit.
            case 46: // '.'
                return readToken_dot();

                // Punctuation tokens.
            case 40: ++tokPos; return finishToken(_parenL);
            case 41: ++tokPos; return finishToken(_parenR);
            case 59: ++tokPos; return finishToken(_semi);
            case 44: ++tokPos; return finishToken(_comma);
            case 91: ++tokPos; return finishToken(_bracketL);
            case 93: ++tokPos; return finishToken(_bracketR);
            case 123: ++tokPos; return finishToken(_braceL);
            case 125: ++tokPos; return finishToken(_braceR);
            case 58: ++tokPos; return finishToken(_colon);
            case 63: ++tokPos; return finishToken(_question);

                // '0x' is a hexadecimal number.
            case 48: // '0'
                var next = input.charCodeAt(tokPos + 1);
                if (next === 120 || next === 88) return readHexNumber();
                // Anything else beginning with a digit is an integer, octal
                // number, or float.
            case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: // 1-9
                return readNumber(false);

                // Quotes produce strings.
            case 34: case 39: // '"', "'"
                return readString(code);

                // Operators are parsed inline in tiny state machines. '=' (61) is
                // often referred to. `finishOp` simply skips the amount of
                // characters it is given as second argument, and returns a token
                // of the type given by its first argument.

            case 47: // '/'
                return readToken_slash(code);

            case 37: case 42: // '%*'
                return readToken_mult_modulo();

            case 124: case 38: // '|&'
                return readToken_pipe_amp(code);

            case 94: // '^'
                return readToken_caret();

            case 43: case 45: // '+-'
                return readToken_plus_min(code);

            case 60: case 62: // '<>'
                return readToken_lt_gt(code);

            case 61: case 33: // '=!'
                return readToken_eq_excl(code);

            case 126: // '~'
                return finishOp(_prefix, 1);
        }

        return false;
    }

    function readToken(forceRegexp) {
        if (!forceRegexp) tokStart = tokPos;
        else tokPos = tokStart + 1;
        if (options.locations) tokStartLoc = new line_loc_t;
        if (forceRegexp) return readRegexp();
        if (tokPos >= inputLen) return finishToken(_eof);

        var code = input.charCodeAt(tokPos);
        // Identifier or keyword. '\uXXXX' sequences are allowed in
        // identifiers, so '\' also dispatches to that.
        if (isIdentifierStart(code) || code === 92 /* '\' */) return readWord();

        var tok = getTokenFromCode(code);

        if (tok === false) {
            // If we are here, we either found a non-ASCII identifier
            // character, or something that's entirely disallowed.
            var ch = String.fromCharCode(code);
            if (ch === "\\" || nonASCIIidentifierStart.test(ch)) return readWord();
            raise(tokPos, "Unexpected character '" + ch + "'");
        }
        return tok;
    }

    function finishOp(type, size) {
        var str = input.slice(tokPos, tokPos + size);
        tokPos += size;
        finishToken(type, str);
    }

    // Parse a regular expression. Some context-awareness is necessary,
    // since a '/' inside a '[]' set does not end the expression.

    function readRegexp() {
        var content = "", escaped, inClass, start = tokPos;
        for (; ;) {
            if (tokPos >= inputLen) raise(start, "Unterminated regular expression");
            var ch = input.charAt(tokPos);
            if (newline.test(ch)) raise(start, "Unterminated regular expression");
            if (!escaped) {
                if (ch === "[") inClass = true;
                else if (ch === "]" && inClass) inClass = false;
                else if (ch === "/" && !inClass) break;
                escaped = ch === "\\";
            } else escaped = false;
            ++tokPos;
        }
        var content = input.slice(start, tokPos);
        ++tokPos;
        // Need to use `readWord1` because '\uXXXX' sequences are allowed
        // here (don't ask).
        var mods = readWord1();
        if (mods && !/^[gmsiy]*$/.test(mods)) raise(start, "Invalid regexp flag");
        try {
            var value = new RegExp(content, mods);
        } catch (e) {
            if (e instanceof SyntaxError) raise(start, e.message);
            raise(e);
        }
        return finishToken(_regexp, value);
    }

    // Read an integer in the given radix. Return null if zero digits
    // were read, the integer value otherwise. When `len` is given, this
    // will return `null` unless the integer has exactly `len` digits.

    function readInt(radix, len) {
        var start = tokPos, total = 0;
        for (var i = 0, e = len == null ? Infinity : len; i < e; ++i) {
            var code = input.charCodeAt(tokPos), val;
            if (code >= 97) val = code - 97 + 10; // a
            else if (code >= 65) val = code - 65 + 10; // A
            else if (code >= 48 && code <= 57) val = code - 48; // 0-9
            else val = Infinity;
            if (val >= radix) break;
            ++tokPos;
            total = total * radix + val;
        }
        if (tokPos === start || len != null && tokPos - start !== len) return null;

        return total;
    }

    function readHexNumber() {
        tokPos += 2; // 0x
        var val = readInt(16);
        if (val == null) raise(tokStart + 2, "Expected hexadecimal number");
        if (isIdentifierStart(input.charCodeAt(tokPos))) raise(tokPos, "Identifier directly after number");
        return finishToken(_num, val);
    }

    // Read an integer, octal integer, or floating-point number.

    function readNumber(startsWithDot) {
        var start = tokPos, isFloat = false, octal = input.charCodeAt(tokPos) === 48;
        if (!startsWithDot && readInt(10) === null) raise(start, "Invalid number");
        if (input.charCodeAt(tokPos) === 46) {
            ++tokPos;
            readInt(10);
            isFloat = true;
        }
        var next = input.charCodeAt(tokPos);
        if (next === 69 || next === 101) { // 'eE'
            next = input.charCodeAt(++tokPos);
            if (next === 43 || next === 45)++tokPos; // '+-'
            if (readInt(10) === null) raise(start, "Invalid number");
            isFloat = true;
        }
        if (isIdentifierStart(input.charCodeAt(tokPos))) raise(tokPos, "Identifier directly after number");

        var str = input.slice(start, tokPos), val;
        if (isFloat) val = parseFloat(str);
        else if (!octal || str.length === 1) val = parseInt(str, 10);
        else if (/[89]/.test(str) || strict) raise(start, "Invalid number");
        else val = parseInt(str, 8);
        return finishToken(_num, val);
    }

    // Read a string value, interpreting backslash-escapes.

    function readString(quote) {
        tokPos++;
        var out = "";
        for (; ;) {
            if (tokPos >= inputLen) raise(tokStart, "Unterminated string constant");
            var ch = input.charCodeAt(tokPos);
            if (ch === quote) {
                ++tokPos;
                return finishToken(_string, out);
            }
            if (ch === 92) { // '\'
                ch = input.charCodeAt(++tokPos);
                var octal = /^[0-7]+/.exec(input.slice(tokPos, tokPos + 3));
                if (octal) octal = octal[0];
                while (octal && parseInt(octal, 8) > 255) octal = octal.slice(0, -1);
                if (octal === "0") octal = null;
                ++tokPos;
                if (octal) {
                    if (strict) raise(tokPos - 2, "Octal literal in strict mode");
                    out += String.fromCharCode(parseInt(octal, 8));
                    tokPos += octal.length - 1;
                } else {
                    switch (ch) {
                        case 110: out += "\n"; break; // 'n' -> '\n'
                        case 114: out += "\r"; break; // 'r' -> '\r'
                        case 120: out += String.fromCharCode(readHexChar(2)); break; // 'x'
                        case 117: out += String.fromCharCode(readHexChar(4)); break; // 'u'
                        case 85: out += String.fromCharCode(readHexChar(8)); break; // 'U'
                        case 116: out += "\t"; break; // 't' -> '\t'
                        case 98: out += "\b"; break; // 'b' -> '\b'
                        case 118: out += "\u000b"; break; // 'v' -> '\u000b'
                        case 102: out += "\f"; break; // 'f' -> '\f'
                        case 48: out += "\0"; break; // 0 -> '\0'
                        case 13: if (input.charCodeAt(tokPos) === 10)++tokPos; // '\r\n'
                        case 10: // ' \n'
                            if (options.locations) { tokLineStart = tokPos; ++tokCurLine; }
                            break;
                        default: out += String.fromCharCode(ch); break;
                    }
                }
            } else {
                if (ch === 13 || ch === 10 || ch === 8232 || ch === 8233) raise(tokStart, "Unterminated string constant");
                out += String.fromCharCode(ch); // '\'
                ++tokPos;
            }
        }
    }

    // Used to read character escape sequences ('\x', '\u', '\U').

    function readHexChar(len) {
        var n = readInt(16, len);
        if (n === null) raise(tokStart, "Bad character escape sequence");
        return n;
    }

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.

    var containsEsc;

    // Read an identifier, and return it as a string. Sets `containsEsc`
    // to whether the word contained a '\u' escape.
    //
    // Only builds up the word character-by-character when it actually
    // containeds an escape, as a micro-optimization.

    function readWord1() {
        containsEsc = false;
        var word, first = true, start = tokPos;
        for (; ;) {
            var ch = input.charCodeAt(tokPos);
            if (isIdentifierChar(ch)) {
                if (containsEsc) word += input.charAt(tokPos);
                ++tokPos;
            } else if (ch === 92) { // "\"
                if (!containsEsc) word = input.slice(start, tokPos);
                containsEsc = true;
                if (input.charCodeAt(++tokPos) != 117) // "u"
                    raise(tokPos, "Expecting Unicode escape sequence \\uXXXX");
                ++tokPos;
                var esc = readHexChar(4);
                var escStr = String.fromCharCode(esc);
                if (!escStr) raise(tokPos - 1, "Invalid Unicode escape");
                if (!(first ? isIdentifierStart(esc) : isIdentifierChar(esc)))
                    raise(tokPos - 4, "Invalid Unicode escape");
                word += escStr;
            } else {
                break;
            }
            first = false;
        }
        return containsEsc ? word : input.slice(start, tokPos);
    }

    // Read an identifier or keyword token. Will check for reserved
    // words when necessary.

    function readWord() {
        var word = readWord1();
        var type = _name;
        if (!containsEsc && isKeyword(word))
            type = keywordTypes[word];
        return finishToken(type, word);
    }

    // ## Parser

    // A recursive descent parser operates by defining functions for all
    // syntactic elements, and recursively calling those, each function
    // advancing the input stream and returning an AST node. Precedence
    // of constructs (for example, the fact that `!x[1]` means `!(x[1])`
    // instead of `(!x)[1]` is handled by the fact that the parser
    // function that parses unary prefix operators is called first, and
    // in turn calls the function that parses `[]` subscripts — that
    // way, it'll receive the node for `x[1]` already parsed, and wraps
    // *that* in the unary operator node.
    //
    // Acorn uses an [operator precedence parser][opp] to handle binary
    // operator precedence, because it is much more compact than using
    // the technique outlined above, which uses different, nesting
    // functions to specify precedence, for all of the ten binary
    // precedence levels that JavaScript defines.
    //
    // [opp]: http://en.wikipedia.org/wiki/Operator-precedence_parser

    // ### Parser utilities

    // Continue to the next token.

    function next() {
        lastStart = tokStart;
        lastEnd = tokEnd;
        lastEndLoc = tokEndLoc;
        readToken();
    }

    // Enter strict mode. Re-reads the next token to please pedantic
    // tests ("use strict"; 010; -- should fail).

    function setStrict(strct) {
        strict = strct;
        tokPos = tokStart;
        if (options.locations) {
            while (tokPos < tokLineStart) {
                tokLineStart = input.lastIndexOf("\n", tokLineStart - 2) + 1;
                --tokCurLine;
            }
        }
        skipSpace();
        readToken();
    }

    // Start an AST node, attaching a start offset.

    function node_t() {
        this.type = null;
        this.start = tokStart;
        this.end = null;
    }

    function node_loc_t() {
        this.start = tokStartLoc;
        this.end = null;
        if (sourceFile !== null) this.source = sourceFile;
    }

    function startNode() {
        var node = new node_t();
        if (options.locations)
            node.loc = new node_loc_t();
        if (options.directSourceFile)
            node.sourceFile = options.directSourceFile;
        if (options.ranges)
            node.range = [tokStart, 0];
        return node;
    }

    // Start a node whose start offset information should be based on
    // the start of another node. For example, a binary operator node is
    // only started after its left-hand side has already been parsed.

    function startNodeFrom(other) {
        var node = new node_t();
        node.start = other.start;
        if (options.locations) {
            node.loc = new node_loc_t();
            node.loc.start = other.loc.start;
        }
        if (options.ranges)
            node.range = [other.range[0], 0];

        return node;
    }

    // Finish an AST node, adding `type` and `end` properties.

    function finishNode(node, type) {
        node.type = type;
        node.end = lastEnd;
        if (options.locations)
            node.loc.end = lastEndLoc;
        if (options.ranges)
            node.range[1] = lastEnd;
        return node;
    }

    // Test whether a statement node is the string literal `"use strict"`.

    function isUseStrict(stmt) {
        return options.ecmaVersion >= 5 && stmt.type === "ExpressionStatement" &&
          stmt.expression.type === "Literal" && stmt.expression.value === "use strict";
    }

    // Predicate that tests whether the next token is of the given
    // type, and if yes, consumes it as a side effect.

    function eat(type) {
        if (tokType === type) {
            next();
            return true;
        }
    }

    // Test whether a semicolon can be inserted at the current position.

    function canInsertSemicolon() {
        return !options.strictSemicolons &&
          (tokType === _eof || tokType === _braceR || newline.test(input.slice(lastEnd, tokStart)));
    }

    // Consume a semicolon, or, failing that, see if we are allowed to
    // pretend that there is a semicolon at this position.

    function semicolon() {
        if (!eat(_semi) && !canInsertSemicolon()) unexpected();
    }

    // Expect a token of a given type. If found, consume it, otherwise,
    // raise an unexpected token error.

    function expect(type) {
        if (tokType === type) next();
        else unexpected();
    }

    // Raise an unexpected token error.

    function unexpected() {
        raise(tokStart, "Unexpected token");
    }

    // Verify that a node is an lval — something that can be assigned
    // to.

    function checkLVal(expr) {
        if (expr.type !== "Identifier" && expr.type !== "MemberExpression")
            raise(expr.start, "Assigning to rvalue");
        if (strict && expr.type === "Identifier" && isStrictBadIdWord(expr.name))
            raise(expr.start, "Assigning to " + expr.name + " in strict mode");
    }

    // ### Statement parsing

    // Parse a program. Initializes the parser, reads any number of
    // statements, and wraps them in a Program node.  Optionally takes a
    // `program` argument.  If present, the statements will be appended
    // to its body instead of creating a new node.

    function parseTopLevel(program) {
        lastStart = lastEnd = tokPos;
        if (options.locations) lastEndLoc = new line_loc_t;
        inFunction = strict = null;
        labels = [];
        readToken();

        var node = program || startNode(), first = true;
        if (!program) node.body = [];
        while (tokType !== _eof) {
            var stmt = parseStatement();
            node.body.push(stmt);
            if (first && isUseStrict(stmt)) setStrict(true);
            first = false;
        }
        return finishNode(node, "Program");
    }

    var loopLabel = { kind: "loop" }, switchLabel = { kind: "switch" };

    // Parse a single statement.
    //
    // If expecting a statement and finding a slash operator, parse a
    // regular expression literal. This is to handle cases like
    // `if (foo) /blah/.exec(foo);`, where looking at the previous token
    // does not help.

    function parseStatement() {
        if (tokType === _slash || tokType === _assign && tokVal == "/=")
            readToken(true);

        var starttype = tokType, node = startNode();

        // Most types of statements are recognized by the keyword they
        // start with. Many are trivial to parse, some require a bit of
        // complexity.

        switch (starttype) {
            case _break: case _continue:
                next();
                var isBreak = starttype === _break;
                if (eat(_semi) || canInsertSemicolon()) node.label = null;
                else if (tokType !== _name) unexpected();
                else {
                    node.label = parseIdent();
                    semicolon();
                }

                // Verify that there is an actual destination to break or
                // continue to.
                for (var i = 0; i < labels.length; ++i) {
                    var lab = labels[i];
                    if (node.label == null || lab.name === node.label.name) {
                        if (lab.kind != null && (isBreak || lab.kind === "loop")) break;
                        if (node.label && isBreak) break;
                    }
                }
                if (i === labels.length) raise(node.start, "Unsyntactic " + starttype.keyword);
                return finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");

            case _debugger:
                next();
                semicolon();
                return finishNode(node, "DebuggerStatement");

            case _do:
                next();
                labels.push(loopLabel);
                node.body = parseStatement();
                labels.pop();
                expect(_while);
                node.test = parseParenExpression();
                semicolon();
                return finishNode(node, "DoWhileStatement");

                // Disambiguating between a `for` and a `for`/`in` loop is
                // non-trivial. Basically, we have to parse the init `var`
                // statement or expression, disallowing the `in` operator (see
                // the second parameter to `parseExpression`), and then check
                // whether the next token is `in`. When there is no init part
                // (semicolon immediately after the opening parenthesis), it is
                // a regular `for` loop.

            case _for:
                next();
                labels.push(loopLabel);
                expect(_parenL);
                if (tokType === _semi) return parseFor(node, null);
                if (tokType === _var) {
                    var init = startNode();
                    next();
                    parseVar(init, true);
                    finishNode(init, "VariableDeclaration");
                    if (init.declarations.length === 1 && eat(_in))
                        return parseForIn(node, init);
                    return parseFor(node, init);
                }
                var init = parseExpression(false, true);
                if (eat(_in)) { checkLVal(init); return parseForIn(node, init); }
                return parseFor(node, init);

            case _function:
                next();
                return parseFunction(node, true);

            case _if:
                next();
                node.test = parseParenExpression();
                node.consequent = parseStatement();
                node.alternate = eat(_else) ? parseStatement() : null;
                return finishNode(node, "IfStatement");

            case _return:
                if (!inFunction && !options.allowReturnOutsideFunction)
                    raise(tokStart, "'return' outside of function");
                next();

                // In `return` (and `break`/`continue`), the keywords with
                // optional arguments, we eagerly look for a semicolon or the
                // possibility to insert one.

                if (eat(_semi) || canInsertSemicolon()) node.argument = null;
                else { node.argument = parseExpression(); semicolon(); }
                return finishNode(node, "ReturnStatement");

            case _switch:
                next();
                node.discriminant = parseParenExpression();
                node.cases = [];
                expect(_braceL);
                labels.push(switchLabel);

                // Statements under must be grouped (by label) in SwitchCase
                // nodes. `cur` is used to keep the node that we are currently
                // adding statements to.

                for (var cur, sawDefault; tokType != _braceR;) {
                    if (tokType === _case || tokType === _default) {
                        var isCase = tokType === _case;
                        if (cur) finishNode(cur, "SwitchCase");
                        node.cases.push(cur = startNode());
                        cur.consequent = [];
                        next();
                        if (isCase) cur.test = parseExpression();
                        else {
                            if (sawDefault) raise(lastStart, "Multiple default clauses"); sawDefault = true;
                            cur.test = null;
                        }
                        expect(_colon);
                    } else {
                        if (!cur) unexpected();
                        cur.consequent.push(parseStatement());
                    }
                }
                if (cur) finishNode(cur, "SwitchCase");
                next(); // Closing brace
                labels.pop();
                return finishNode(node, "SwitchStatement");

            case _throw:
                next();
                if (newline.test(input.slice(lastEnd, tokStart)))
                    raise(lastEnd, "Illegal newline after throw");
                node.argument = parseExpression();
                semicolon();
                return finishNode(node, "ThrowStatement");

            case _try:
                next();
                node.block = parseBlock();
                node.handler = null;
                if (tokType === _catch) {
                    var clause = startNode();
                    next();
                    expect(_parenL);
                    clause.param = parseIdent();
                    if (strict && isStrictBadIdWord(clause.param.name))
                        raise(clause.param.start, "Binding " + clause.param.name + " in strict mode");
                    expect(_parenR);
                    clause.guard = null;
                    clause.body = parseBlock();
                    node.handler = finishNode(clause, "CatchClause");
                }
                node.guardedHandlers = empty;
                node.finalizer = eat(_finally) ? parseBlock() : null;
                if (!node.handler && !node.finalizer)
                    raise(node.start, "Missing catch or finally clause");
                return finishNode(node, "TryStatement");

            case _var:
                next();
                parseVar(node);
                semicolon();
                return finishNode(node, "VariableDeclaration");

            case _while:
                next();
                node.test = parseParenExpression();
                labels.push(loopLabel);
                node.body = parseStatement();
                labels.pop();
                return finishNode(node, "WhileStatement");

            case _with:
                if (strict) raise(tokStart, "'with' in strict mode");
                next();
                node.object = parseParenExpression();
                node.body = parseStatement();
                return finishNode(node, "WithStatement");

            case _braceL:
                return parseBlock();

            case _semi:
                next();
                return finishNode(node, "EmptyStatement");

                // If the statement does not start with a statement keyword or a
                // brace, it's an ExpressionStatement or LabeledStatement. We
                // simply start parsing an expression, and afterwards, if the
                // next token is a colon and the expression was a simple
                // Identifier node, we switch to interpreting it as a label.

            default:
                var maybeName = tokVal, expr = parseExpression();
                if (starttype === _name && expr.type === "Identifier" && eat(_colon)) {
                    for (var i = 0; i < labels.length; ++i)
                        if (labels[i].name === maybeName) raise(expr.start, "Label '" + maybeName + "' is already declared");
                    var kind = tokType.isLoop ? "loop" : tokType === _switch ? "switch" : null;
                    labels.push({ name: maybeName, kind: kind });
                    node.body = parseStatement();
                    labels.pop();
                    node.label = expr;
                    return finishNode(node, "LabeledStatement");
                } else {
                    node.expression = expr;
                    semicolon();
                    return finishNode(node, "ExpressionStatement");
                }
        }
    }

    // Used for constructs like `switch` and `if` that insist on
    // parentheses around their expression.

    function parseParenExpression() {
        expect(_parenL);
        var val = parseExpression();
        expect(_parenR);
        return val;
    }

    // Parse a semicolon-enclosed block of statements, handling `"use
    // strict"` declarations when `allowStrict` is true (used for
    // function bodies).

    function parseBlock(allowStrict) {
        var node = startNode(), first = true, strict = false, oldStrict;
        node.body = [];
        expect(_braceL);
        while (!eat(_braceR)) {
            var stmt = parseStatement();
            node.body.push(stmt);
            if (first && allowStrict && isUseStrict(stmt)) {
                oldStrict = strict;
                setStrict(strict = true);
            }
            first = false;
        }
        if (strict && !oldStrict) setStrict(false);
        return finishNode(node, "BlockStatement");
    }

    // Parse a regular `for` loop. The disambiguation code in
    // `parseStatement` will already have parsed the init statement or
    // expression.

    function parseFor(node, init) {
        node.init = init;
        expect(_semi);
        node.test = tokType === _semi ? null : parseExpression();
        expect(_semi);
        node.update = tokType === _parenR ? null : parseExpression();
        expect(_parenR);
        node.body = parseStatement();
        labels.pop();
        return finishNode(node, "ForStatement");
    }

    // Parse a `for`/`in` loop.

    function parseForIn(node, init) {
        node.left = init;
        node.right = parseExpression();
        expect(_parenR);
        node.body = parseStatement();
        labels.pop();
        return finishNode(node, "ForInStatement");
    }

    // Parse a list of variable declarations.

    function parseVar(node, noIn) {
        node.declarations = [];
        node.kind = "var";
        for (; ;) {
            var decl = startNode();
            decl.id = parseIdent();
            if (strict && isStrictBadIdWord(decl.id.name))
                raise(decl.id.start, "Binding " + decl.id.name + " in strict mode");
            decl.init = eat(_eq) ? parseExpression(true, noIn) : null;
            node.declarations.push(finishNode(decl, "VariableDeclarator"));
            if (!eat(_comma)) break;
        }
        return node;
    }

    // ### Expression parsing

    // These nest, from the most general expression type at the top to
    // 'atomic', nondivisible expression types at the bottom. Most of
    // the functions will simply let the function(s) below them parse,
    // and, *if* the syntactic construct they handle is present, wrap
    // the AST node that the inner parser gave them in another node.

    // Parse a full expression. The arguments are used to forbid comma
    // sequences (in argument lists, array literals, or object literals)
    // or the `in` operator (in for loops initalization expressions).

    function parseExpression(noComma, noIn) {
        var expr = parseMaybeAssign(noIn);
        if (!noComma && tokType === _comma) {
            var node = startNodeFrom(expr);
            node.expressions = [expr];
            while (eat(_comma)) node.expressions.push(parseMaybeAssign(noIn));
            return finishNode(node, "SequenceExpression");
        }
        return expr;
    }

    // Parse an assignment expression. This includes applications of
    // operators like `+=`.

    function parseMaybeAssign(noIn) {
        var left = parseMaybeConditional(noIn);
        if (tokType.isAssign) {
            var node = startNodeFrom(left);
            node.operator = tokVal;
            node.left = left;
            next();
            node.right = parseMaybeAssign(noIn);
            checkLVal(left);
            return finishNode(node, "AssignmentExpression");
        }
        return left;
    }

    // Parse a ternary conditional (`?:`) operator.

    function parseMaybeConditional(noIn) {
        var expr = parseExprOps(noIn);
        if (eat(_question)) {
            var node = startNodeFrom(expr);
            node.test = expr;
            node.consequent = parseExpression(true);
            expect(_colon);
            node.alternate = parseExpression(true, noIn);
            return finishNode(node, "ConditionalExpression");
        }
        return expr;
    }

    // Start the precedence parser.

    function parseExprOps(noIn) {
        return parseExprOp(parseMaybeUnary(), -1, noIn);
    }

    // Parse binary operators with the operator precedence parsing
    // algorithm. `left` is the left-hand side of the operator.
    // `minPrec` provides context that allows the function to stop and
    // defer further parser to one of its callers when it encounters an
    // operator that has a lower precedence than the set it is parsing.

    function parseExprOp(left, minPrec, noIn) {
        var prec = tokType.binop;
        if (prec != null && (!noIn || tokType !== _in)) {
            if (prec > minPrec) {
                var node = startNodeFrom(left);
                node.left = left;
                node.operator = tokVal;
                var op = tokType;
                next();
                node.right = parseExprOp(parseMaybeUnary(), prec, noIn);
                var exprNode = finishNode(node, (op === _logicalOR || op === _logicalAND) ? "LogicalExpression" : "BinaryExpression");
                return parseExprOp(exprNode, minPrec, noIn);
            }
        }
        return left;
    }

    // Parse unary operators, both prefix and postfix.

    function parseMaybeUnary() {
        if (tokType.prefix) {
            var node = startNode(), update = tokType.isUpdate;
            node.operator = tokVal;
            node.prefix = true;
            tokRegexpAllowed = true;
            next();
            node.argument = parseMaybeUnary();
            if (update) checkLVal(node.argument);
            else if (strict && node.operator === "delete" &&
                     node.argument.type === "Identifier")
                raise(node.start, "Deleting local variable in strict mode");
            return finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
        }
        var expr = parseExprSubscripts();
        while (tokType.postfix && !canInsertSemicolon()) {
            var node = startNodeFrom(expr);
            node.operator = tokVal;
            node.prefix = false;
            node.argument = expr;
            checkLVal(expr);
            next();
            expr = finishNode(node, "UpdateExpression");
        }
        return expr;
    }

    // Parse call, dot, and `[]`-subscript expressions.

    function parseExprSubscripts() {
        return parseSubscripts(parseExprAtom());
    }

    function parseSubscripts(base, noCalls) {
        if (eat(_dot)) {
            var node = startNodeFrom(base);
            node.object = base;
            node.property = parseIdent(true);
            node.computed = false;
            return parseSubscripts(finishNode(node, "MemberExpression"), noCalls);
        } else if (eat(_bracketL)) {
            var node = startNodeFrom(base);
            node.object = base;
            node.property = parseExpression();
            node.computed = true;
            expect(_bracketR);
            return parseSubscripts(finishNode(node, "MemberExpression"), noCalls);
        } else if (!noCalls && eat(_parenL)) {
            var node = startNodeFrom(base);
            node.callee = base;
            node.arguments = parseExprList(_parenR, false);
            return parseSubscripts(finishNode(node, "CallExpression"), noCalls);
        } else return base;
    }

    // Parse an atomic expression — either a single token that is an
    // expression, an expression started by a keyword like `function` or
    // `new`, or an expression wrapped in punctuation like `()`, `[]`,
    // or `{}`.

    function parseExprAtom() {
        switch (tokType) {
            case _this:
                var node = startNode();
                next();
                return finishNode(node, "ThisExpression");
            case _name:
                return parseIdent();
            case _num: case _string: case _regexp:
                var node = startNode();
                node.value = tokVal;
                node.raw = input.slice(tokStart, tokEnd);
                next();
                return finishNode(node, "Literal");

            case _null: case _true: case _false:
                var node = startNode();
                node.value = tokType.atomValue;
                node.raw = tokType.keyword;
                next();
                return finishNode(node, "Literal");

            case _parenL:
                var tokStartLoc1 = tokStartLoc, tokStart1 = tokStart;
                next();
                var val = parseExpression();
                val.start = tokStart1;
                val.end = tokEnd;
                if (options.locations) {
                    val.loc.start = tokStartLoc1;
                    val.loc.end = tokEndLoc;
                }
                if (options.ranges)
                    val.range = [tokStart1, tokEnd];
                expect(_parenR);
                return val;

            case _bracketL:
                var node = startNode();
                next();
                node.elements = parseExprList(_bracketR, true, true);
                return finishNode(node, "ArrayExpression");

            case _braceL:
                return parseObj();

            case _function:
                var node = startNode();
                next();
                return parseFunction(node, false);

            case _new:
                return parseNew();

            default:
                unexpected();
        }
    }

    // New's precedence is slightly tricky. It must allow its argument
    // to be a `[]` or dot subscript expression, but not a call — at
    // least, not without wrapping it in parentheses. Thus, it uses the

    function parseNew() {
        var node = startNode();
        next();
        node.callee = parseSubscripts(parseExprAtom(), true);
        if (eat(_parenL)) node.arguments = parseExprList(_parenR, false);
        else node.arguments = empty;
        return finishNode(node, "NewExpression");
    }

    // Parse an object literal.

    function parseObj() {
        var node = startNode(), first = true, sawGetSet = false;
        node.properties = [];
        next();
        while (!eat(_braceR)) {
            if (!first) {
                expect(_comma);
                if (options.allowTrailingCommas && eat(_braceR)) break;
            } else first = false;

            var prop = { key: parsePropertyName() }, isGetSet = false, kind;
            if (eat(_colon)) {
                prop.value = parseExpression(true);
                kind = prop.kind = "init";
            } else if (options.ecmaVersion >= 5 && prop.key.type === "Identifier" &&
                       (prop.key.name === "get" || prop.key.name === "set")) {
                isGetSet = sawGetSet = true;
                kind = prop.kind = prop.key.name;
                prop.key = parsePropertyName();
                if (tokType !== _parenL) unexpected();
                prop.value = parseFunction(startNode(), false);
            } else unexpected();

            // getters and setters are not allowed to clash — either with
            // each other or with an init property — and in strict mode,
            // init properties are also not allowed to be repeated.

            if (prop.key.type === "Identifier" && (strict || sawGetSet)) {
                for (var i = 0; i < node.properties.length; ++i) {
                    var other = node.properties[i];
                    if (other.key.name === prop.key.name) {
                        var conflict = kind == other.kind || isGetSet && other.kind === "init" ||
                          kind === "init" && (other.kind === "get" || other.kind === "set");
                        if (conflict && !strict && kind === "init" && other.kind === "init") conflict = false;
                        if (conflict) raise(prop.key.start, "Redefinition of property");
                    }
                }
            }
            node.properties.push(prop);
        }
        return finishNode(node, "ObjectExpression");
    }

    function parsePropertyName() {
        if (tokType === _num || tokType === _string) return parseExprAtom();
        return parseIdent(true);
    }

    // Parse a function declaration or literal (depending on the
    // `isStatement` parameter).

    function parseFunction(node, isStatement) {
        if (tokType === _name) node.id = parseIdent();
        else if (isStatement) unexpected();
        else node.id = null;
        node.params = [];
        var first = true;
        expect(_parenL);
        while (!eat(_parenR)) {
            if (!first) expect(_comma); else first = false;
            node.params.push(parseIdent());
        }

        // Start a new scope with regard to labels and the `inFunction`
        // flag (restore them to their old value afterwards).
        var oldInFunc = inFunction, oldLabels = labels;
        inFunction = true; labels = [];
        node.body = parseBlock(true);
        inFunction = oldInFunc; labels = oldLabels;

        // If this is a strict mode function, verify that argument names
        // are not repeated, and it does not try to bind the words `eval`
        // or `arguments`.
        if (strict || node.body.body.length && isUseStrict(node.body.body[0])) {
            for (var i = node.id ? -1 : 0; i < node.params.length; ++i) {
                var id = i < 0 ? node.id : node.params[i];
                if (isStrictReservedWord(id.name) || isStrictBadIdWord(id.name))
                    raise(id.start, "Defining '" + id.name + "' in strict mode");
                if (i >= 0) for (var j = 0; j < i; ++j) if (id.name === node.params[j].name)
                    raise(id.start, "Argument name clash in strict mode");
            }
        }

        return finishNode(node, isStatement ? "FunctionDeclaration" : "FunctionExpression");
    }

    // Parses a comma-separated list of expressions, and returns them as
    // an array. `close` is the token type that ends the list, and
    // `allowEmpty` can be turned on to allow subsequent commas with
    // nothing in between them to be parsed as `null` (which is needed
    // for array literals).

    function parseExprList(close, allowTrailingComma, allowEmpty) {
        var elts = [], first = true;
        while (!eat(close)) {
            if (!first) {
                expect(_comma);
                if (allowTrailingComma && options.allowTrailingCommas && eat(close)) break;
            } else first = false;

            if (allowEmpty && tokType === _comma) elts.push(null);
            else elts.push(parseExpression(true));
        }
        return elts;
    }

    // Parse the next token as an identifier. If `liberal` is true (used
    // when parsing properties), it will also convert keywords into
    // identifiers.

    function parseIdent(liberal) {
        var node = startNode();
        if (liberal && options.forbidReserved == "everywhere") liberal = false;
        if (tokType === _name) {
            if (!liberal &&
                (options.forbidReserved &&
                 (options.ecmaVersion === 3 ? isReservedWord3 : isReservedWord5)(tokVal) ||
                 strict && isStrictReservedWord(tokVal)) &&
                input.slice(tokStart, tokEnd).indexOf("\\") == -1)
                raise(tokStart, "The keyword '" + tokVal + "' is reserved");
            node.name = tokVal;
        } else if (liberal && tokType.keyword) {
            node.name = tokType.keyword;
        } else {
            unexpected();
        }
        tokRegexpAllowed = false;
        next();
        return finishNode(node, "Identifier");
    }

});


//#endregion


//#region acorn/acorn_loose.js

// Acorn: Loose parser
//
// This module provides an alternative parser (`parse_dammit`) that
// exposes that same interface as `parse`, but will try to parse
// anything as JavaScript, repairing syntax error the best it can.
// There are circumstances in which it will raise an error and give
// up, but they are very rare. The resulting AST will be a mostly
// valid JavaScript AST (as per the [Mozilla parser API][api], except
// that:
//
// - Return outside functions is allowed
//
// - Label consistency (no conflicts, break only to existing labels)
//   is not enforced.
//
// - Bogus Identifier nodes with a name of `"✖"` are inserted whenever
//   the parser got too confused to return anything meaningful.
//
// [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
//
// The expected use for this is to *first* try `acorn.parse`, and only
// if that fails switch to `parse_dammit`. The loose parser might
// parse badly indented code incorrectly, so **don't** use it as
// your default parser.
//
// Quite a lot of acorn.js is duplicated here. The alternative was to
// add a *lot* of extra cruft to that file, making it less readable
// and slower. Copying and editing the code allowed me to make
// invasive changes and simplifications without creating a complicated
// tangle.

(function (root, mod) {
    if (typeof exports == "object" && typeof module == "object") return mod(exports, require("./acorn")); // CommonJS
    if (typeof define == "function" && define.amd) return define(["exports", "./acorn"], mod); // AMD
    mod(root.acorn || (root.acorn = {}), root.acorn); // Plain browser env
})(this, function (exports, acorn) {
    "use strict";

    var tt = acorn.tokTypes;

    var options, input, fetchToken, context;

    exports.parse_dammit = function (inpt, opts) {
        if (!opts) opts = {};
        input = String(inpt);
        options = opts;
        if (!opts.tabSize) opts.tabSize = 4;
        fetchToken = acorn.tokenize(inpt, opts);
        sourceFile = options.sourceFile || null;
        context = [];
        nextLineStart = 0;
        ahead.length = 0;
        next();
        return parseTopLevel();
    };

    var lastEnd, token = { start: 0, end: 0 }, ahead = [];
    var curLineStart, nextLineStart, curIndent, lastEndLoc, sourceFile;

    function next() {
        lastEnd = token.end;
        if (options.locations)
            lastEndLoc = token.endLoc;

        if (ahead.length)
            token = ahead.shift();
        else
            token = readToken();

        if (token.start >= nextLineStart) {
            while (token.start >= nextLineStart) {
                curLineStart = nextLineStart;
                nextLineStart = lineEnd(curLineStart) + 1;
            }
            curIndent = indentationAfter(curLineStart);
        }
    }

    function readToken() {
        for (; ;) {
            try {
                return fetchToken();
            } catch (e) {
                if (!(e instanceof SyntaxError)) throw e;

                // Try to skip some text, based on the error message, and then continue
                var msg = e.message, pos = e.raisedAt, replace = true;
                if (/unterminated/i.test(msg)) {
                    pos = lineEnd(e.pos);
                    if (/string/.test(msg)) {
                        replace = { start: e.pos, end: pos, type: tt.string, value: input.slice(e.pos + 1, pos) };
                    } else if (/regular expr/i.test(msg)) {
                        var re = input.slice(e.pos, pos);
                        try { re = new RegExp(re); } catch (e) { }
                        replace = { start: e.pos, end: pos, type: tt.regexp, value: re };
                    } else {
                        replace = false;
                    }
                } else if (/invalid (unicode|regexp|number)|expecting unicode|octal literal|is reserved|directly after number/i.test(msg)) {
                    while (pos < input.length && !isSpace(input.charCodeAt(pos)))++pos;
                } else if (/character escape|expected hexadecimal/i.test(msg)) {
                    while (pos < input.length) {
                        var ch = input.charCodeAt(pos++);
                        if (ch === 34 || ch === 39 || isNewline(ch)) break;
                    }
                } else if (/unexpected character/i.test(msg)) {
                    pos++;
                    replace = false;
                } else {
                    throw e;
                }
                resetTo(pos);
                if (replace === true) replace = { start: pos, end: pos, type: tt.name, value: "✖" };
                if (replace) {
                    if (options.locations) {
                        replace.startLoc = acorn.getLineInfo(input, replace.start);
                        replace.endLoc = acorn.getLineInfo(input, replace.end);
                    }
                    return replace;
                }
            }
        }
    }

    function resetTo(pos) {
        var ch = input.charAt(pos - 1);
        var reAllowed = !ch || /[\[\{\(,;:?\/*=+\-~!|&%^<>]/.test(ch) ||
          /[enwfd]/.test(ch) && /\b(keywords|case|else|return|throw|new|in|(instance|type)of|delete|void)$/.test(input.slice(pos - 10, pos));
        fetchToken.jumpTo(pos, reAllowed);
    }

    function copyToken(token) {
        var copy = { start: token.start, end: token.end, type: token.type, value: token.value };
        if (options.locations) {
            copy.startLoc = token.startLoc;
            copy.endLoc = token.endLoc;
        }
        return copy;
    }

    function lookAhead(n) {
        // Copy token objects, because fetchToken will overwrite the one
        // it returns, and in this case we still need it
        if (!ahead.length)
            token = copyToken(token);
        while (n > ahead.length)
            ahead.push(copyToken(readToken()));
        return ahead[n - 1];
    }

    var newline = /[\n\r\u2028\u2029]/;

    function isNewline(ch) {
        return ch === 10 || ch === 13 || ch === 8232 || ch === 8329;
    }
    function isSpace(ch) {
        return (ch < 14 && ch > 8) || ch === 32 || ch === 160 || isNewline(ch);
    }

    function pushCx() {
        context.push(curIndent);
    }
    function popCx() {
        curIndent = context.pop();
    }

    function lineEnd(pos) {
        while (pos < input.length && !isNewline(input.charCodeAt(pos)))++pos;
        return pos;
    }
    function indentationAfter(pos) {
        for (var count = 0; ; ++pos) {
            var ch = input.charCodeAt(pos);
            if (ch === 32)++count;
            else if (ch === 9) count += options.tabSize;
            else return count;
        }
    }

    function closes(closeTok, indent, line, blockHeuristic) {
        if (token.type === closeTok || token.type === tt.eof) return true;
        if (line != curLineStart && curIndent < indent && tokenStartsLine() &&
            (!blockHeuristic || nextLineStart >= input.length ||
             indentationAfter(nextLineStart) < indent)) return true;
        return false;
    }

    function tokenStartsLine() {
        for (var p = token.start - 1; p >= curLineStart; --p) {
            var ch = input.charCodeAt(p);
            if (ch !== 9 && ch !== 32) return false;
        }
        return true;
    }

    function node_t(start) {
        this.type = null;
        this.start = start;
        this.end = null;
    }

    function node_loc_t(start) {
        this.start = start || token.startLoc || { line: 1, column: 0 };
        this.end = null;
        if (sourceFile !== null) this.source = sourceFile;
    }

    function startNode() {
        var node = new node_t(token.start);
        if (options.locations)
            node.loc = new node_loc_t();
        if (options.directSourceFile)
            node.sourceFile = options.directSourceFile;
        return node;
    }

    function startNodeFrom(other) {
        var node = new node_t(other.start);
        if (options.locations)
            node.loc = new node_loc_t(other.loc.start);
        return node;
    }

    function finishNode(node, type) {
        node.type = type;
        node.end = lastEnd;
        if (options.locations)
            node.loc.end = lastEndLoc;
        return node;
    }

    function getDummyLoc() {
        if (options.locations) {
            var loc = new node_loc_t();
            loc.end = loc.start;
            return loc;
        }
    };

    function dummyIdent() {
        var dummy = new node_t(token.start);
        dummy.type = "Identifier";
        dummy.end = token.start;
        dummy.name = "✖";
        dummy.loc = getDummyLoc();
        return dummy;
    }
    function isDummy(node) { return node.name == "✖"; }

    function eat(type) {
        if (token.type === type) {
            next();
            return true;
        }
    }

    function canInsertSemicolon() {
        return (token.type === tt.eof || token.type === tt.braceR || newline.test(input.slice(lastEnd, token.start)));
    }
    function semicolon() {
        eat(tt.semi);
    }

    function expect(type) {
        if (eat(type)) return true;
        if (lookAhead(1).type == type) {
            next(); next();
            return true;
        }
        if (lookAhead(2).type == type) {
            next(); next(); next();
            return true;
        }
    }

    function checkLVal(expr) {
        if (expr.type === "Identifier" || expr.type === "MemberExpression") return expr;
        return dummyIdent();
    }

    function parseTopLevel() {
        var node = startNode();
        node.body = [];
        while (token.type !== tt.eof) node.body.push(parseStatement());
        return finishNode(node, "Program");
    }

    function parseStatement() {
        var starttype = token.type, node = startNode();

        switch (starttype) {
            case tt._break: case tt._continue:
                next();
                var isBreak = starttype === tt._break;
                node.label = token.type === tt.name ? parseIdent() : null;
                semicolon();
                return finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");

            case tt._debugger:
                next();
                semicolon();
                return finishNode(node, "DebuggerStatement");

            case tt._do:
                next();
                node.body = parseStatement();
                node.test = eat(tt._while) ? parseParenExpression() : dummyIdent();
                semicolon();
                return finishNode(node, "DoWhileStatement");

            case tt._for:
                next();
                pushCx();
                expect(tt.parenL);
                if (token.type === tt.semi) return parseFor(node, null);
                if (token.type === tt._var) {
                    var init = startNode();
                    next();
                    parseVar(init, true);
                    if (init.declarations.length === 1 && eat(tt._in))
                        return parseForIn(node, init);
                    return parseFor(node, init);
                }
                var init = parseExpression(false, true);
                if (eat(tt._in)) { return parseForIn(node, checkLVal(init)); }
                return parseFor(node, init);

            case tt._function:
                next();
                return parseFunction(node, true);

            case tt._if:
                next();
                node.test = parseParenExpression();
                node.consequent = parseStatement();
                node.alternate = eat(tt._else) ? parseStatement() : null;
                return finishNode(node, "IfStatement");

            case tt._return:
                next();
                if (eat(tt.semi) || canInsertSemicolon()) node.argument = null;
                else { node.argument = parseExpression(); semicolon(); }
                return finishNode(node, "ReturnStatement");

            case tt._switch:
                var blockIndent = curIndent, line = curLineStart;
                next();
                node.discriminant = parseParenExpression();
                node.cases = [];
                pushCx();
                expect(tt.braceL);

                for (var cur; !closes(tt.braceR, blockIndent, line, true) ;) {
                    if (token.type === tt._case || token.type === tt._default) {
                        var isCase = token.type === tt._case;
                        if (cur) finishNode(cur, "SwitchCase");
                        node.cases.push(cur = startNode());
                        cur.consequent = [];
                        next();
                        if (isCase) cur.test = parseExpression();
                        else cur.test = null;
                        expect(tt.colon);
                    } else {
                        if (!cur) {
                            node.cases.push(cur = startNode());
                            cur.consequent = [];
                            cur.test = null;
                        }
                        cur.consequent.push(parseStatement());
                    }
                }
                if (cur) finishNode(cur, "SwitchCase");
                popCx();
                eat(tt.braceR);
                return finishNode(node, "SwitchStatement");

            case tt._throw:
                next();
                node.argument = parseExpression();
                semicolon();
                return finishNode(node, "ThrowStatement");

            case tt._try:
                next();
                node.block = parseBlock();
                node.handler = null;
                if (token.type === tt._catch) {
                    var clause = startNode();
                    next();
                    expect(tt.parenL);
                    clause.param = parseIdent();
                    expect(tt.parenR);
                    clause.guard = null;
                    clause.body = parseBlock();
                    node.handler = finishNode(clause, "CatchClause");
                }
                node.finalizer = eat(tt._finally) ? parseBlock() : null;
                if (!node.handler && !node.finalizer) return node.block;
                return finishNode(node, "TryStatement");

            case tt._var:
                next();
                node = parseVar(node);
                semicolon();
                return node;

            case tt._while:
                next();
                node.test = parseParenExpression();
                node.body = parseStatement();
                return finishNode(node, "WhileStatement");

            case tt._with:
                next();
                node.object = parseParenExpression();
                node.body = parseStatement();
                return finishNode(node, "WithStatement");

            case tt.braceL:
                return parseBlock();

            case tt.semi:
                next();
                return finishNode(node, "EmptyStatement");

            default:
                var expr = parseExpression();
                if (isDummy(expr)) {
                    next();
                    if (token.type === tt.eof) return finishNode(node, "EmptyStatement");
                    return parseStatement();
                } else if (starttype === tt.name && expr.type === "Identifier" && eat(tt.colon)) {
                    node.body = parseStatement();
                    node.label = expr;
                    return finishNode(node, "LabeledStatement");
                } else {
                    node.expression = expr;
                    semicolon();
                    return finishNode(node, "ExpressionStatement");
                }
        }
    }

    function parseBlock() {
        var node = startNode();
        pushCx();
        expect(tt.braceL);
        var blockIndent = curIndent, line = curLineStart;
        node.body = [];
        while (!closes(tt.braceR, blockIndent, line, true))
            node.body.push(parseStatement());
        popCx();
        eat(tt.braceR);
        return finishNode(node, "BlockStatement");
    }

    function parseFor(node, init) {
        node.init = init;
        node.test = node.update = null;
        if (eat(tt.semi) && token.type !== tt.semi) node.test = parseExpression();
        if (eat(tt.semi) && token.type !== tt.parenR) node.update = parseExpression();
        popCx();
        expect(tt.parenR);
        node.body = parseStatement();
        return finishNode(node, "ForStatement");
    }

    function parseForIn(node, init) {
        node.left = init;
        node.right = parseExpression();
        popCx();
        expect(tt.parenR);
        node.body = parseStatement();
        return finishNode(node, "ForInStatement");
    }

    function parseVar(node, noIn) {
        node.declarations = [];
        node.kind = "var";
        while (token.type === tt.name) {
            var decl = startNode();
            decl.id = parseIdent();
            decl.init = eat(tt.eq) ? parseExpression(true, noIn) : null;
            node.declarations.push(finishNode(decl, "VariableDeclarator"));
            if (!eat(tt.comma)) break;
        }
        if (!node.declarations.length) {
            var decl = startNode();
            decl.id = dummyIdent();
            node.declarations.push(finishNode(decl, "VariableDeclarator"));
        }
        return finishNode(node, "VariableDeclaration");
    }

    function parseExpression(noComma, noIn) {
        var expr = parseMaybeAssign(noIn);
        if (!noComma && token.type === tt.comma) {
            var node = startNodeFrom(expr);
            node.expressions = [expr];
            while (eat(tt.comma)) node.expressions.push(parseMaybeAssign(noIn));
            return finishNode(node, "SequenceExpression");
        }
        return expr;
    }

    function parseParenExpression() {
        pushCx();
        expect(tt.parenL);
        var val = parseExpression();
        popCx();
        expect(tt.parenR);
        return val;
    }

    function parseMaybeAssign(noIn) {
        var left = parseMaybeConditional(noIn);
        if (token.type.isAssign) {
            var node = startNodeFrom(left);
            node.operator = token.value;
            node.left = checkLVal(left);
            next();
            node.right = parseMaybeAssign(noIn);
            return finishNode(node, "AssignmentExpression");
        }
        return left;
    }

    function parseMaybeConditional(noIn) {
        var expr = parseExprOps(noIn);
        if (eat(tt.question)) {
            var node = startNodeFrom(expr);
            node.test = expr;
            node.consequent = parseExpression(true);
            node.alternate = expect(tt.colon) ? parseExpression(true, noIn) : dummyIdent();
            return finishNode(node, "ConditionalExpression");
        }
        return expr;
    }

    function parseExprOps(noIn) {
        var indent = curIndent, line = curLineStart;
        return parseExprOp(parseMaybeUnary(noIn), -1, noIn, indent, line);
    }

    function parseExprOp(left, minPrec, noIn, indent, line) {
        if (curLineStart != line && curIndent < indent && tokenStartsLine()) return left;
        var prec = token.type.binop;
        if (prec != null && (!noIn || token.type !== tt._in)) {
            if (prec > minPrec) {
                var node = startNodeFrom(left);
                node.left = left;
                node.operator = token.value;
                next();
                if (curLineStart != line && curIndent < indent && tokenStartsLine())
                    node.right = dummyIdent();
                else
                    node.right = parseExprOp(parseMaybeUnary(noIn), prec, noIn, indent, line);
                var node = finishNode(node, /&&|\|\|/.test(node.operator) ? "LogicalExpression" : "BinaryExpression");
                return parseExprOp(node, minPrec, noIn, indent, line);
            }
        }
        return left;
    }

    function parseMaybeUnary(noIn) {
        if (token.type.prefix) {
            var node = startNode(), update = token.type.isUpdate;
            node.operator = token.value;
            node.prefix = true;
            next();
            node.argument = parseMaybeUnary(noIn);
            if (update) node.argument = checkLVal(node.argument);
            return finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
        }
        var expr = parseExprSubscripts();
        while (token.type.postfix && !canInsertSemicolon()) {
            var node = startNodeFrom(expr);
            node.operator = token.value;
            node.prefix = false;
            node.argument = checkLVal(expr);
            next();
            expr = finishNode(node, "UpdateExpression");
        }
        return expr;
    }

    function parseExprSubscripts() {
        return parseSubscripts(parseExprAtom(), false, curIndent, curLineStart);
    }

    function parseSubscripts(base, noCalls, startIndent, line) {
        for (; ;) {
            if (curLineStart != line && curIndent <= startIndent && tokenStartsLine()) {
                if (token.type == tt.dot && curIndent == startIndent)
                    --startIndent;
                else
                    return base;
            }

            if (eat(tt.dot)) {
                var node = startNodeFrom(base);
                node.object = base;
                if (curLineStart != line && curIndent <= startIndent && tokenStartsLine())
                    node.property = dummyIdent();
                else
                    node.property = parsePropertyName() || dummyIdent();
                node.computed = false;
                base = finishNode(node, "MemberExpression");
            } else if (token.type == tt.bracketL) {
                pushCx();
                next();
                var node = startNodeFrom(base);
                node.object = base;
                node.property = parseExpression();
                node.computed = true;
                popCx();
                expect(tt.bracketR);
                base = finishNode(node, "MemberExpression");
            } else if (!noCalls && token.type == tt.parenL) {
                pushCx();
                var node = startNodeFrom(base);
                node.callee = base;
                node.arguments = parseExprList(tt.parenR);
                base = finishNode(node, "CallExpression");
            } else {
                return base;
            }
        }
    }

    function parseExprAtom() {
        switch (token.type) {
            case tt._this:
                var node = startNode();
                next();
                return finishNode(node, "ThisExpression");
            case tt.name:
                return parseIdent();
            case tt.num: case tt.string: case tt.regexp:
                var node = startNode();
                node.value = token.value;
                node.raw = input.slice(token.start, token.end);
                next();
                return finishNode(node, "Literal");

            case tt._null: case tt._true: case tt._false:
                var node = startNode();
                node.value = token.type.atomValue;
                node.raw = token.type.keyword;
                next();
                return finishNode(node, "Literal");

            case tt.parenL:
                var tokStart1 = token.start;
                next();
                var val = parseExpression();
                val.start = tokStart1;
                val.end = token.end;
                expect(tt.parenR);
                return val;

            case tt.bracketL:
                var node = startNode();
                pushCx();
                node.elements = parseExprList(tt.bracketR);
                return finishNode(node, "ArrayExpression");

            case tt.braceL:
                return parseObj();

            case tt._function:
                var node = startNode();
                next();
                return parseFunction(node, false);

            case tt._new:
                return parseNew();

            default:
                return dummyIdent();
        }
    }

    function parseNew() {
        var node = startNode(), startIndent = curIndent, line = curLineStart;
        next();
        node.callee = parseSubscripts(parseExprAtom(), true, startIndent, line);
        if (token.type == tt.parenL) {
            pushCx();
            node.arguments = parseExprList(tt.parenR);
        } else {
            node.arguments = [];
        }
        return finishNode(node, "NewExpression");
    }

    function parseObj() {
        var node = startNode();
        node.properties = [];
        pushCx();
        next();
        var propIndent = curIndent, line = curLineStart;
        while (!closes(tt.braceR, propIndent, line)) {
            var name = parsePropertyName();
            if (!name) { if (isDummy(parseExpression(true))) next(); eat(tt.comma); continue; }
            var prop = { key: name }, isGetSet = false, kind;
            if (eat(tt.colon)) {
                prop.value = parseExpression(true);
                kind = prop.kind = "init";
            } else if (options.ecmaVersion >= 5 && prop.key.type === "Identifier" &&
                       (prop.key.name === "get" || prop.key.name === "set")) {
                isGetSet = true;
                kind = prop.kind = prop.key.name;
                prop.key = parsePropertyName() || dummyIdent();
                prop.value = parseFunction(startNode(), false);
            } else {
                next();
                eat(tt.comma);
                continue;
            }

            node.properties.push(prop);
            eat(tt.comma);
        }
        popCx();
        eat(tt.braceR);
        return finishNode(node, "ObjectExpression");
    }

    function parsePropertyName() {
        if (token.type === tt.num || token.type === tt.string) return parseExprAtom();
        if (token.type === tt.name || token.type.keyword) return parseIdent();
    }

    function parseIdent() {
        var node = startNode();
        node.name = token.type === tt.name ? token.value : token.type.keyword;
        next();
        return finishNode(node, "Identifier");
    }

    function parseFunction(node, isStatement) {
        if (token.type === tt.name) node.id = parseIdent();
        else if (isStatement) node.id = dummyIdent();
        else node.id = null;
        node.params = [];
        pushCx();
        expect(tt.parenL);
        while (token.type == tt.name) {
            node.params.push(parseIdent());
            eat(tt.comma);
        }
        popCx();
        eat(tt.parenR);
        node.body = parseBlock();
        return finishNode(node, isStatement ? "FunctionDeclaration" : "FunctionExpression");
    }

    function parseExprList(close) {
        var indent = curIndent, line = curLineStart, elts = [], continuedLine = nextLineStart;
        next(); // Opening bracket
        if (curLineStart > continuedLine) continuedLine = curLineStart;
        while (!closes(close, indent + (curLineStart <= continuedLine ? 1 : 0), line)) {
            var elt = parseExpression(true);
            if (isDummy(elt)) {
                if (closes(close, indent, line)) break;
                next();
            } else {
                elts.push(elt);
            }
            while (eat(tt.comma)) { }
        }
        popCx();
        eat(close);
        return elts;
    }
});


//#endregion


//#region acorn/util/walk.js

// AST walker module for Mozilla Parser API compatible trees

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") return mod(exports); // CommonJS
    if (typeof define == "function" && define.amd) return define(["exports"], mod); // AMD
    mod((this.acorn || (this.acorn = {})).walk = {}); // Plain browser env
})(function (exports) {
    "use strict";

    // A simple walk is one where you simply specify callbacks to be
    // called on specific nodes. The last two arguments are optional. A
    // simple use would be
    //
    //     walk.simple(myTree, {
    //         Expression: function(node) { ... }
    //     });
    //
    // to do something with all expressions. All Parser API node types
    // can be used to identify node types, as well as Expression,
    // Statement, and ScopeBody, which denote categories of nodes.
    //
    // The base argument can be used to pass a custom (recursive)
    // walker, and state can be used to give this walked an initial
    // state.
    exports.simple = function (node, visitors, base, state) {
        if (!base) base = exports.base;
        function c(node, st, override) {
            var type = override || node.type, found = visitors[type];
            base[type](node, st, c);
            if (found) found(node, st);
        }
        c(node, state);
    };

    // An ancestor walk builds up an array of ancestor nodes (including
    // the current node) and passes them to the callback as the state parameter.
    exports.ancestor = function (node, visitors, base, state) {
        if (!base) base = exports.base;
        if (!state) state = [];
        function c(node, st, override) {
            var type = override || node.type, found = visitors[type];
            if (node != st[st.length - 1]) {
                st = st.slice();
                st.push(node);
            }
            base[type](node, st, c);
            if (found) found(node, st);
        }
        c(node, state);
    };

    // A recursive walk is one where your functions override the default
    // walkers. They can modify and replace the state parameter that's
    // threaded through the walk, and can opt how and whether to walk
    // their child nodes (by calling their third argument on these
    // nodes).
    exports.recursive = function (node, state, funcs, base) {
        var visitor = funcs ? exports.make(funcs, base) : base;
        function c(node, st, override) {
            visitor[override || node.type](node, st, c);
        }
        c(node, state);
    };

    function makeTest(test) {
        if (typeof test == "string")
            return function (type) { return type == test; };
        else if (!test)
            return function () { return true; };
        else
            return test;
    }

    function Found(node, state) { this.node = node; this.state = state; }

    // Find a node with a given start, end, and type (all are optional,
    // null can be used as wildcard). Returns a {node, state} object, or
    // undefined when it doesn't find a matching node.
    exports.findNodeAt = function (node, start, end, test, base, state) {
        test = makeTest(test);
        try {
            if (!base) base = exports.base;
            var c = function (node, st, override) {
                var type = override || node.type;
                if ((start == null || node.start <= start) &&
                    (end == null || node.end >= end))
                    base[type](node, st, c);
                if (test(type, node) &&
                    (start == null || node.start == start) &&
                    (end == null || node.end == end))
                    throw new Found(node, st);
            };
            c(node, state);
        } catch (e) {
            if (e instanceof Found) return e;
            throw e;
        }
    };

    // Find the innermost node of a given type that contains the given
    // position. Interface similar to findNodeAt.
    exports.findNodeAround = function (node, pos, test, base, state) {
        test = makeTest(test);
        try {
            if (!base) base = exports.base;
            var c = function (node, st, override) {
                var type = override || node.type;
                if (node.start > pos || node.end < pos) return;
                base[type](node, st, c);
                if (test(type, node)) throw new Found(node, st);
            };
            c(node, state);
        } catch (e) {
            if (e instanceof Found) return e;
            throw e;
        }
    };

    // Find the outermost matching node after a given position.
    exports.findNodeAfter = function (node, pos, test, base, state) {
        test = makeTest(test);
        try {
            if (!base) base = exports.base;
            var c = function (node, st, override) {
                if (node.end < pos) return;
                var type = override || node.type;
                if (node.start >= pos && test(type, node)) throw new Found(node, st);
                base[type](node, st, c);
            };
            c(node, state);
        } catch (e) {
            if (e instanceof Found) return e;
            throw e;
        }
    };

    // Find the outermost matching node before a given position.
    exports.findNodeBefore = function (node, pos, test, base, state) {
        test = makeTest(test);
        if (!base) base = exports.base;
        var max;
        var c = function (node, st, override) {
            if (node.start > pos) return;
            var type = override || node.type;
            if (node.end <= pos && (!max || max.node.end < node.end) && test(type, node))
                max = new Found(node, st);
            base[type](node, st, c);
        };
        c(node, state);
        return max;
    };

    // Used to create a custom walker. Will fill in all missing node
    // type properties with the defaults.
    exports.make = function (funcs, base) {
        if (!base) base = exports.base;
        var visitor = {};
        for (var type in base) visitor[type] = base[type];
        for (var type in funcs) visitor[type] = funcs[type];
        return visitor;
    };

    function skipThrough(node, st, c) { c(node, st); }
    function ignore(_node, _st, _c) { }

    // Node walkers.

    var base = exports.base = {};
    base.Program = base.BlockStatement = function (node, st, c) {
        for (var i = 0; i < node.body.length; ++i)
            c(node.body[i], st, "Statement");
    };
    base.Statement = skipThrough;
    base.EmptyStatement = ignore;
    base.ExpressionStatement = function (node, st, c) {
        c(node.expression, st, "Expression");
    };
    base.IfStatement = function (node, st, c) {
        c(node.test, st, "Expression");
        c(node.consequent, st, "Statement");
        if (node.alternate) c(node.alternate, st, "Statement");
    };
    base.LabeledStatement = function (node, st, c) {
        c(node.body, st, "Statement");
    };
    base.BreakStatement = base.ContinueStatement = ignore;
    base.WithStatement = function (node, st, c) {
        c(node.object, st, "Expression");
        c(node.body, st, "Statement");
    };
    base.SwitchStatement = function (node, st, c) {
        c(node.discriminant, st, "Expression");
        for (var i = 0; i < node.cases.length; ++i) {
            var cs = node.cases[i];
            if (cs.test) c(cs.test, st, "Expression");
            for (var j = 0; j < cs.consequent.length; ++j)
                c(cs.consequent[j], st, "Statement");
        }
    };
    base.ReturnStatement = function (node, st, c) {
        if (node.argument) c(node.argument, st, "Expression");
    };
    base.ThrowStatement = function (node, st, c) {
        c(node.argument, st, "Expression");
    };
    base.TryStatement = function (node, st, c) {
        c(node.block, st, "Statement");
        if (node.handler) c(node.handler.body, st, "ScopeBody");
        if (node.finalizer) c(node.finalizer, st, "Statement");
    };
    base.WhileStatement = function (node, st, c) {
        c(node.test, st, "Expression");
        c(node.body, st, "Statement");
    };
    base.DoWhileStatement = base.WhileStatement;
    base.ForStatement = function (node, st, c) {
        if (node.init) c(node.init, st, "ForInit");
        if (node.test) c(node.test, st, "Expression");
        if (node.update) c(node.update, st, "Expression");
        c(node.body, st, "Statement");
    };
    base.ForInStatement = function (node, st, c) {
        c(node.left, st, "ForInit");
        c(node.right, st, "Expression");
        c(node.body, st, "Statement");
    };
    base.ForInit = function (node, st, c) {
        if (node.type == "VariableDeclaration") c(node, st);
        else c(node, st, "Expression");
    };
    base.DebuggerStatement = ignore;

    base.FunctionDeclaration = function (node, st, c) {
        c(node, st, "Function");
    };
    base.VariableDeclaration = function (node, st, c) {
        for (var i = 0; i < node.declarations.length; ++i) {
            var decl = node.declarations[i];
            if (decl.init) c(decl.init, st, "Expression");
        }
    };

    base.Function = function (node, st, c) {
        c(node.body, st, "ScopeBody");
    };
    base.ScopeBody = function (node, st, c) {
        c(node, st, "Statement");
    };

    base.Expression = skipThrough;
    base.ThisExpression = ignore;
    base.ArrayExpression = function (node, st, c) {
        for (var i = 0; i < node.elements.length; ++i) {
            var elt = node.elements[i];
            if (elt) c(elt, st, "Expression");
        }
    };
    base.ObjectExpression = function (node, st, c) {
        for (var i = 0; i < node.properties.length; ++i)
            c(node.properties[i].value, st, "Expression");
    };
    base.FunctionExpression = base.FunctionDeclaration;
    base.SequenceExpression = function (node, st, c) {
        for (var i = 0; i < node.expressions.length; ++i)
            c(node.expressions[i], st, "Expression");
    };
    base.UnaryExpression = base.UpdateExpression = function (node, st, c) {
        c(node.argument, st, "Expression");
    };
    base.BinaryExpression = base.AssignmentExpression = base.LogicalExpression = function (node, st, c) {
        c(node.left, st, "Expression");
        c(node.right, st, "Expression");
    };
    base.ConditionalExpression = function (node, st, c) {
        c(node.test, st, "Expression");
        c(node.consequent, st, "Expression");
        c(node.alternate, st, "Expression");
    };
    base.NewExpression = base.CallExpression = function (node, st, c) {
        c(node.callee, st, "Expression");
        if (node.arguments) for (var i = 0; i < node.arguments.length; ++i)
            c(node.arguments[i], st, "Expression");
    };
    base.MemberExpression = function (node, st, c) {
        c(node.object, st, "Expression");
        if (node.computed) c(node.property, st, "Expression");
    };
    base.Identifier = base.Literal = ignore;

    // A custom walker that keeps track of the scope chain and the
    // variables defined in it.
    function makeScope(prev, isCatch) {
        return { vars: Object.create(null), prev: prev, isCatch: isCatch };
    }
    function normalScope(scope) {
        while (scope.isCatch) scope = scope.prev;
        return scope;
    }
    exports.scopeVisitor = exports.make({
        Function: function (node, scope, c) {
            var inner = makeScope(scope);
            for (var i = 0; i < node.params.length; ++i)
                inner.vars[node.params[i].name] = { type: "argument", node: node.params[i] };
            if (node.id) {
                var decl = node.type == "FunctionDeclaration";
                (decl ? normalScope(scope) : inner).vars[node.id.name] =
                  { type: decl ? "function" : "function name", node: node.id };
            }
            c(node.body, inner, "ScopeBody");
        },
        TryStatement: function (node, scope, c) {
            c(node.block, scope, "Statement");
            if (node.handler) {
                var inner = makeScope(scope, true);
                inner.vars[node.handler.param.name] = { type: "catch clause", node: node.handler.param };
                c(node.handler.body, inner, "ScopeBody");
            }
            if (node.finalizer) c(node.finalizer, scope, "Statement");
        },
        VariableDeclaration: function (node, scope, c) {
            var target = normalScope(scope);
            for (var i = 0; i < node.declarations.length; ++i) {
                var decl = node.declarations[i];
                target.vars[decl.id.name] = { type: "var", node: decl.id };
                if (decl.init) c(decl.init, scope, "Expression");
            }
        }
    });

});

//#endregion


//#region tern/lib/signal.js

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return mod(exports);
    if (typeof define == "function" && define.amd) // AMD
        return define(["exports"], mod);
    mod((self.tern || (self.tern = {})).signal = {}); // Plain browser env
})(function (exports) {
    function on(type, f) {
        var handlers = this._handlers || (this._handlers = Object.create(null));
        (handlers[type] || (handlers[type] = [])).push(f);
    }
    function off(type, f) {
        var arr = this._handlers && this._handlers[type];
        if (arr) for (var i = 0; i < arr.length; ++i)
            if (arr[i] == f) { arr.splice(i, 1); break; }
    }
    function signal(type, a1, a2, a3, a4) {
        var arr = this._handlers && this._handlers[type];
        if (arr) for (var i = 0; i < arr.length; ++i) arr[i].call(this, a1, a2, a3, a4);
    }

    exports.mixin = function (obj) {
        obj.on = on; obj.off = off; obj.signal = signal;
        return obj;
    };
});


//#endregion


//#region tern/lib/tern.js

// The Tern server object

// A server is a stateful object that manages the analysis for a
// project, and defines an interface for querying the code in the
// project.

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return mod(exports, require("./infer"), require("./signal"), require("acorn/acorn"), require("acorn/util/walk"));
    if (typeof define == "function" && define.amd) // AMD
        return define(["exports", "./infer", "./signal", "acorn/acorn", "acorn/util/walk"], mod);
    mod(self.tern || (self.tern = {}), tern, tern.signal, acorn, acorn.walk); // Plain browser env
})(function (exports, infer, signal, acorn, walk) {
    "use strict";

    var plugins = Object.create(null);
    exports.registerPlugin = function (name, init) {
        plugins[name] = init;
    };

    var defaultOptions = {
        debug: true,
        async: false,
        getFile: function (_f, c) {
            if (this.async) c(null, null);
        },
        defs: [],
        plugins: {},
        fetchTimeout: 1000
    };

    var queryTypes = {
        completions: {
            takesFile: true,
            run: findCompletions
        },
        properties: {
            run: findProperties
        },
        type: {
            takesFile: true,
            run: findTypeAt
        },
        documentation: {
            takesFile: true,
            run: findDocs
        },
        definition: {
            takesFile: true,
            run: findDef
        },
        refs: {
            takesFile: true,
            fullFile: true,
            run: findRefs
        },
        rename: {
            takesFile: true,
            fullFile: true,
            run: buildRename
        },
        files: {
            run: listFiles
        }
    };

    exports.defineQueryType = function (name, desc) {
        queryTypes[name] = desc;
    };

    function File(name) {
        this.name = name;
        this.scope = this.text = this.ast = this.lineOffsets = null;
    }
    File.prototype.asLineChar = function (pos) {
        return asLineChar(this, pos);
    };

    function updateText(file, text, srv) {
        file.text = text;
        file.ast = infer.parse(text, srv.passes, {
            directSourceFile: file
        });
        file.lineOffsets = null;
    }

    var Server = exports.Server = function (options) {
        this.cx = null;
        this.options = options || {};
        for (var o in defaultOptions)
            if (!options.hasOwnProperty(o))
                options[o] = defaultOptions[o];

        this.handlers = Object.create(null);
        this.files = [];
        this.uses = 0;
        this.pending = 0;
        this.asyncError = null;
        this.passes = Object.create(null);

        this.defs = options.defs.slice(0);
        //logO(options.plugins,'options.plugins');
        for (var plugin in options.plugins)
            // logO(plugin, 'plugin');
            if (options.plugins.hasOwnProperty(plugin) && plugin in plugins) {
                var init = plugins[plugin](this, options.plugins[plugin]);
                // logO(init,'init plug');
                if (init && init.defs) {
                    if (init.loadFirst) this.defs.unshift(init.defs);
                    else this.defs.push(init.defs);
                }
                if (init && init.passes)
                    for (var type in init.passes)
                        if (init.passes.hasOwnProperty(type))
                            (this.passes[type] || (this.passes[type] = [])).push(init.passes[type]);
            }
        //ADDED BY ME to expose this publicly
        this.resolvePos = function (file, pos, tolerant) {
            return resolvePos(file, pos, tolerant);
        }

        this.reset();
    };
    Server.prototype = signal.mixin({
        addFile: function (name, /*optional*/ text) {
            ensureFile(this, name, text);
        },
        delFile: function (name) {
            for (var i = 0, f; i < this.files.length; ++i)
                if ((f = this.files[i]).name == name) {
                    clearFile(this, f);
                    this.files.splice(i--, 1);
                    return;
                }
        },
        reset: function () {
            this.signal("reset");
            this.cx = new infer.Context(this.defs, this);
            this.uses = 0;
            for (var i = 0; i < this.files.length; ++i) {
                var file = this.files[i];
                file.scope = null;
            }
        },
        //Doc: doc that request is coming from . c: callback
        request: function (doc, c) {
            //console.log(doc);//document for the request (contains position)            
            var inv = invalidDoc(doc);
            if (inv) return c(inv);

            var self = this;
            doRequest(this, doc, function (err, data) {
                c(err, data);
                if (self.uses > 40) {
                    self.reset();
                    analyzeAll(self, function () { });
                }
            });
        },

        findFile: function (name) {
            return findFile(this.files, name);
        },

        flush: function (c) {
            var cx = this.cx;
            analyzeAll(this, function (err) {
                if (err) return c(err);
                infer.withContext(cx, c);
            });
        },

        startAsyncAction: function () {
            ++this.pending;
        },
        finishAsyncAction: function (err) {
            if (err) this.asyncError = err;
            if (--this.pending == 0) this.signal("everythingFetched");
        }
    });
    //Called from request in this file (above)
    function doRequest(srv, doc, c) {
        //logO(printStackTrace(), 'stack');
        if (doc.query && !queryTypes.hasOwnProperty(doc.query.type))
            return c("No query type '" + doc.query.type + "' defined");

        var query = doc.query;
        // Respond as soon as possible when this just uploads files
        if (!query) c(null, {});

        var files = doc.files || [];
        if (files.length)++srv.uses;
        for (var i = 0; i < files.length; ++i) {
            var file = files[i];
            ensureFile(srv, file.name, file.type == "full" ? file.text : null);
        }

        if (!query) { //in my tests this was not entered            
            analyzeAll(srv, function () { });
            return;
        }

        var queryType = queryTypes[query.type];
        if (queryType.takesFile) {
            //console.log('querytype.takesfile=true');//true for auto complete test
            if (typeof query.file != "string") return c(".query.file must be a string");
            if (!/^#/.test(query.file)) {
                //console.log('!testQuery.file');
                ensureFile(srv, query.file); //NEED TO TEST THIS FUNCTION, its being hit
            }
        }

        analyzeAll(srv, function (err) {
            if (err) return c(err);
            var file = queryType.takesFile && resolveFile(srv, files, query.file);
            if (queryType.fullFile && file.type == "part")
                return c("Can't run a " + query.type + " query on a file fragment");
            //logO(srv.cx.parent.files[0].ast, 'srv.cx.parent.files[0].as ');//gets first file AST (Abstract Syntax Tree)
            infer.withContext(srv.cx, function () {
                var result;
                try {
                    //console.log('infer with context callback entered');
                    //console.log(queryType);//queryType.Run calls findCompletions(I think)                    
                    //query is the doc doing the query with positions of curosr
                    result = queryType.run(srv, query, file);
                }
                catch (e) {
                    //logO(e, 'tern error in AnalyzeAll');
                    if (srv.options.debug && e.name != "TernError") console.error(e.stack);
                    return c(e);
                }
                c(null, result);
            });
        });
    }

    function analyzeFile(srv, file) {
        //srv.cx = server context
        infer.withContext(srv.cx, function () {
            file.scope = srv.cx.topScope;
            srv.signal("beforeLoad", file);
            infer.markVariablesDefinedBy(file.scope, file.name);
            infer.analyze(file.ast, file.name, file.scope, srv.passes);
            infer.purgeMarkedVariables(file.scope);
            srv.signal("afterLoad", file);
        });
        return file;
    }

    function ensureFile(srv, name, text) {
        var known = findFile(srv.files, name);
        if (known) {
            if (text) clearFile(srv, known, text);
            return;
        }

        var file = new File(name);
        srv.files.push(file);
        if (text) {
            updateText(file, text, srv);
        }
        else if (srv.options.async) {
            srv.startAsyncAction();
            srv.options.getFile(name, function (err, text) {
                updateText(file, text || "", srv);
                srv.finishAsyncAction(err);
            });
        }
        else {
            updateText(file, srv.options.getFile(name) || "", srv);
        }
    }

    function clearFile(srv, file, newText) {
        if (file.scope) {
            infer.withContext(srv.cx, function () {
                // FIXME try to batch purges into a single pass (each call needs
                // to traverse the whole graph)
                infer.purgeTypes(file.name);
                infer.markVariablesDefinedBy(file.scope, file.name);
                infer.purgeMarkedVariables(file.scope);
            });
            file.scope = null;
        }
        if (newText != null) updateText(file, newText, srv);
    }

    function fetchAll(srv, c) {
        var done = true,
            returned = false;
        for (var i = 0; i < srv.files.length; ++i) {
            var file = srv.files[i];
            if (file.text != null) continue;
            if (srv.options.async) {
                done = false;
                srv.options.getFile(file.name, function (err, text) {
                    if (err && !returned) {
                        returned = true;
                        return c(err);
                    }
                    updateText(file, text || "", srv);
                    fetchAll(srv, c);
                });
            }
            else {
                try {
                    updateText(file, srv.options.getFile(file.name) || "", srv);
                }
                catch (e) {
                    return c(e);
                }
            }
        }
        if (done) c();
    }

    function waitOnFetch(srv, c) {
        var done = function () {
            srv.off("everythingFetched", done);
            clearTimeout(timeout);
            analyzeAll(srv, c);
        };
        srv.on("everythingFetched", done);
        var timeout = setTimeout(done, srv.options.fetchTimeout);
    }

    function analyzeAll(srv, c) {
        if (srv.pending) return waitOnFetch(srv, c);

        var e = srv.fetchError;
        if (e) {
            srv.fetchError = null;
            return c(e);
        }

        var done = true;
        for (var i = 0; i < srv.files.length; ++i) {
            var file = srv.files[i];
            if (file.text == null) done = false;
            else if (file.scope == null) analyzeFile(srv, file);
        }
        if (done) c();
        else waitOnFetch(srv, c);
    }

    function findFile(arr, name) {
        for (var i = 0; i < arr.length; ++i) {
            var file = arr[i];
            if (file.name == name && file.type != "part") return file;
        }
    }

    function firstLine(str) {
        var end = str.indexOf("\n");
        if (end < 0) return str;
        return str.slice(0, end);
    }

    function findMatchingPosition(line, file, near) {
        var pos = Math.max(0, near - 500),
            closest = null;
        if (!/^\s*$/.test(line))
            for (; ;) {
                var found = file.indexOf(line, pos);
                if (found < 0 || found > near + 500) break;
                if (closest == null || Math.abs(closest - near) > Math.abs(found - near))
                    closest = found;
                pos = found + line.length;
            }
        return closest;
    }

    function scopeDepth(s) {
        for (var i = 0; s; ++i, s = s.prev) { }
        return i;
    }

    function ternError(msg) {
        var err = new Error(msg);
        err.name = "TernError";
        return err;
    }

    function resolveFile(srv, localFiles, name) {
        var isRef = name.match(/^#(\d+)$/);
        if (!isRef) return findFile(srv.files, name);

        var file = localFiles[isRef[1]];
        if (!file) throw ternError("Reference to unknown file " + name);
        if (file.type == "full") return findFile(srv.files, file.name);

        // This is a partial file

        var realFile = file.backing = findFile(srv.files, file.name);
        var offset = file.offset;
        if (file.offsetLines) offset = {
            line: file.offsetLines,
            ch: 0
        };
        file.offset = offset = resolvePos(realFile, file.offsetLines == null ? file.offset : {
            line: file.offsetLines,
            ch: 0
        }, true);
        var line = firstLine(file.text);
        var foundPos = findMatchingPosition(line, realFile.text, offset);
        var pos = foundPos == null ? Math.max(0, realFile.text.lastIndexOf("\n", offset)) : foundPos;

        infer.withContext(srv.cx, function () {
            infer.purgeTypes(file.name, pos, pos + file.text.length);

            var text = file.text,
                m;
            if (m = text.match(/(?:"([^"]*)"|([\w$]+))\s*:\s*function\b/)) {
                var objNode = walk.findNodeAround(file.backing.ast, pos, "ObjectExpression");
                if (objNode && objNode.node.objType)
                    var inObject = {
                        type: objNode.node.objType,
                        prop: m[2] || m[1]
                    };
            }
            if (foundPos && (m = line.match(/^(.*?)\bfunction\b/))) {
                var cut = m[1].length,
                    white = "";
                for (var i = 0; i < cut; ++i) white += " ";
                text = white + text.slice(cut);
                var atFunction = true;
            }

            var scopeStart = infer.scopeAt(realFile.ast, pos, realFile.scope);
            var scopeEnd = infer.scopeAt(realFile.ast, pos + text.length, realFile.scope);
            var scope = file.scope = scopeDepth(scopeStart) < scopeDepth(scopeEnd) ? scopeEnd : scopeStart;
            infer.markVariablesDefinedBy(scopeStart, file.name, pos, pos + file.text.length);
            file.ast = infer.parse(file.text, srv.passes, {
                directSourceFile: file
            });
            infer.analyze(file.ast, file.name, scope, srv.passes);
            infer.purgeMarkedVariables(scopeStart);

            // This is a kludge to tie together the function types (if any)
            // outside and inside of the fragment, so that arguments and
            // return values have some information known about them.
            tieTogether: if (inObject || atFunction) {
                var newInner = infer.scopeAt(file.ast, line.length, scopeStart);
                if (!newInner.fnType) break tieTogether;
                if (inObject) {
                    var prop = inObject.type.getProp(inObject.prop);
                    prop.addType(newInner.fnType);
                }
                else if (atFunction) {
                    var inner = infer.scopeAt(realFile.ast, pos + line.length, realFile.scope);
                    if (inner == scopeStart || !inner.fnType) break tieTogether;
                    var fOld = inner.fnType,
                        fNew = newInner.fnType;
                    if (!fNew || (fNew.name != fOld.name && fOld.name)) break tieTogether;
                    for (var i = 0, e = Math.min(fOld.args.length, fNew.args.length) ; i < e; ++i)
                        fOld.args[i].propagate(fNew.args[i]);
                    fOld.self.propagate(fNew.self);
                    fNew.retval.propagate(fOld.retval);
                }
            }
        });
        return file;
    }

    function isPosition(val) {
        return typeof val == "number" || typeof val == "object" &&
            typeof val.line == "number" && typeof val.ch == "number";
    }

    // Baseline query document validation
    function invalidDoc(doc) {
        if (doc.query) {
            if (typeof doc.query.type != "string") return ".query.type must be a string";
            if (doc.query.start && !isPosition(doc.query.start)) return ".query.start must be a position";
            if (doc.query.end && !isPosition(doc.query.end)) return ".query.end must be a position";
        }
        if (doc.files) {
            if (!Array.isArray(doc.files)) return "Files property must be an array";
            for (var i = 0; i < doc.files.length; ++i) {
                var file = doc.files[i];
                if (typeof file != "object") return ".files[n] must be objects";
                else if (typeof file.text != "string") return ".files[n].text must be a string";
                else if (typeof file.name != "string") return ".files[n].name must be a string";
                else if (file.type == "part") {
                    if (!isPosition(file.offset) && typeof file.offsetLines != "number")
                        return ".files[n].offset must be a position";
                }
                else if (file.type != "full") return ".files[n].type must be \"full\" or \"part\"";
            }
        }
    }

    var offsetSkipLines = 25;

    function findLineStart(file, line) {
        var text = file.text,
            offsets = file.lineOffsets || (file.lineOffsets = [0]);
        var pos = 0,
            curLine = 0;
        var storePos = Math.min(Math.floor(line / offsetSkipLines), offsets.length - 1);
        var pos = offsets[storePos],
            curLine = storePos * offsetSkipLines;

        while (curLine < line) {
            ++curLine;
            pos = text.indexOf("\n", pos) + 1;
            if (pos == 0) return null;
            if (curLine % offsetSkipLines == 0) offsets.push(pos);
        }
        return pos;
    }

    function resolvePos(file, pos, tolerant) {
        if (typeof pos != "number") {
            var lineStart = findLineStart(file, pos.line);
            if (lineStart == null) {
                if (tolerant) pos = file.text.length;
                else throw ternError("File doesn't contain a line " + pos.line);
            }
            else {
                pos = lineStart + pos.ch;
            }
        }
        if (pos > file.text.length) {
            if (tolerant) pos = file.text.length;
            else throw ternError("Position " + pos + " is outside of file.");
        }
        return pos;
    }

    function asLineChar(file, pos) {
        if (!file) return {
            line: 0,
            ch: 0
        };
        var offsets = file.lineOffsets || (file.lineOffsets = [0]);
        var text = file.text,
            line, lineStart;
        for (var i = offsets.length - 1; i >= 0; --i)
            if (offsets[i] <= pos) {
                line = i * offsetSkipLines;
                lineStart = offsets[i];
            }
        for (; ;) {
            var eol = text.indexOf("\n", lineStart);
            if (eol >= pos || eol < 0) break;
            lineStart = eol + 1;
            ++line;
        }
        return {
            line: line,
            ch: pos - lineStart
        };
    }

    function outputPos(query, file, pos) {
        if (query.lineCharPositions) {
            var out = asLineChar(file, pos);
            if (file.type == "part")
                out.line += file.offsetLines != null ? file.offsetLines : asLineChar(file.backing, file.offset).line;
            return out;
        }
        else {
            return pos + (file.type == "part" ? file.offset : 0);
        }
    }

    // Delete empty fields from result objects
    function clean(obj) {
        for (var prop in obj)
            if (obj[prop] == null) delete obj[prop];
        return obj;
    }

    function maybeSet(obj, prop, val) {
        if (val != null) obj[prop] = val;
    }

    // Built-in query types

    function compareCompletions(a, b) {
        if (typeof a != "string") {
            a = a.name;
            b = b.name;
        }
        var aUp = /^[A-Z]/.test(a),
            bUp = /^[A-Z]/.test(b);
        if (aUp == bUp) return a < b ? -1 : a == b ? 0 : 1;
        else return aUp ? 1 : -1;
    }

    function isStringAround(node, start, end) {
        return node.type == "Literal" && typeof node.value == "string" &&
            node.start == start - 1 && node.end <= end + 1;
    }

    function findCompletions(srv, query, file) {        
        //turn of filteirng and sorting as Ace will handle this
        query.filter = false;
        query.sort = false;
        query.caseInsensitive = true;
        if (query.end == null) throw ternError("missing .query.end field");
        var wordStart = resolvePos(file, query.end),
            wordEnd = wordStart,
            text = file.text;        
        while (wordStart && acorn.isIdentifierChar(text.charCodeAt(wordStart - 1))) {
            --wordStart;
        }
        if (query.expandWordForward !== false) {
            while (wordEnd < text.length && acorn.isIdentifierChar(text.charCodeAt(wordEnd))) {
                ++wordEnd;
            }
        }
        //The junk above here is just getting the word the user typed for auto complete, line below has the acutal word
        var word = text.slice(wordStart, wordEnd),
            completions = [];        
        if (query.caseInsensitive) word = word.toLowerCase();
        var wrapAsObjs = query.types || query.depths || query.docs || query.urls || query.origins;

        function gather(prop, obj, depth) {
            // 'hasOwnProperty' and such are usually just noise, leave them
            // out when no prefix is provided.
            if (query.omitObjectPrototype !== false && obj == srv.cx.protos.Object && !word) {
                return;

            }
            if (query.filter !== false && word && !(query.caseInsensitive ? prop.toLowerCase() : prop).ContainsIgnoreChars(word)) {
                return;
            }

            for (var i = 0; i < completions.length; ++i) {
                var c = completions[i];
                if ((wrapAsObjs ? c.name : c) == prop) return;
            }
            var rec = wrapAsObjs ? {
                name: prop
            } : prop;
            completions.push(rec);

            if (query.types || query.docs || query.urls || query.origins) {
                var val = obj ? obj.props[prop] : infer.ANull;
                infer.resetGuessing();
                var type = val.getType();
                rec.guess = infer.didGuess();
                if (query.types)
                    rec.type = infer.toString(type);
                if (query.docs)
                    maybeSet(rec, "doc", val.doc || type && type.doc);
                if (query.urls)
                    maybeSet(rec, "url", val.url || type && type.url);
                if (query.origins)
                    maybeSet(rec, "origin", val.origin || type && type.origin);
            }
            if (query.depths) rec.depth = depth;
        }

        var memberExpr = infer.findExpressionAround(file.ast, null, wordStart, file.scope, "MemberExpression");
        if (memberExpr &&
            (memberExpr.node.computed ? isStringAround(memberExpr.node.property, wordStart, wordEnd) : memberExpr.node.object.end < wordStart)) {
            var prop = memberExpr.node.property;
            prop = prop.type == "Literal" ? prop.value.slice(1) : prop.name;

            memberExpr.node = memberExpr.node.object;
            var tp = infer.expressionType(memberExpr);
            if (tp) infer.forAllPropertiesOf(tp, gather);

            if (!completions.length && query.guess !== false && tp && tp.guessProperties) {
                tp.guessProperties(function (p, o, d) {
                    if (p != prop && p != "✖") gather(p, o, d);
                });
            }
            if (!completions.length && word.length >= 2 && query.guess !== false)
                for (var prop in srv.cx.props) gather(prop, srv.cx.props[prop][0], 0);
        }
        else {
            infer.forAllLocalsAt(file.ast, wordStart, file.scope, gather);
        }

        if (query.sort !== false) completions.sort(compareCompletions);
        return {
            start: outputPos(query, file, wordStart),
            end: outputPos(query, file, wordEnd),
            completions: completions
        };
    }

    function findProperties(srv, query) {
        var prefix = query.prefix,
            found = [];
        for (var prop in srv.cx.props)
            if (prop != "<i>" && (!prefix || prop.indexOf(prefix) == 0)) found.push(prop);
        if (query.sort !== false) found.sort(compareCompletions);
        return {
            completions: found
        };
    }
    //finds expression
    var findExpr = exports.findQueryExpr = function (file, query, wide) {
        // logO(query, 'query'); logO(file, 'file'); 
        // log('resolved pos=' + resolvePos(file, query.end));
        if (query.end == null) throw ternError("missing .query.end field");

        if (query.variable) { //for variable definitions            
            var scope = infer.scopeAt(file.ast, resolvePos(file, query.end), file.scope);
            return {
                node: {
                    type: "Identifier",
                    name: query.variable,
                    start: query.end,
                    end: query.end + 1
                },
                state: scope
            };
        }
        else { //function -- code below finds what we are looking for
            var start = query.start && resolvePos(file, query.start),
                end = resolvePos(file, query.end);
            // logO(start, 'start'); logO(end, 'end');
            //logO(infer.findExpressionAt, ' infer.findExpressionAt');//this is in infer.js
            var expr = infer.findExpressionAt(file.ast, start, end, file.scope);
            //logO(expr, 'expr'); //for some reason its still empty here
            if (expr) return expr;
            expr = infer.findExpressionAround(file.ast, start, end, file.scope);
            //logO(expr, 'expr attempt 2'); //THIS GETS IT for jump to def of function
            if (expr && (wide || (start == null ? end : start) - expr.node.start < 20 || expr.node.end - end < 20))
                return expr;
            throw ternError("No expression at the given position.");
        }
    };

    function findTypeAt(_srv, query, file) {
        var expr = findExpr(file, query);
        infer.resetGuessing();
        var type = infer.expressionType(expr);
        if (query.preferFunction)
            type = type.getFunctionType() || type.getType();
        else
            type = type.getType();

        if (expr.node.type == "Identifier")
            var exprName = expr.node.name;
        else if (expr.node.type == "MemberExpression" && !expr.node.computed)
            var exprName = expr.node.property.name;

        if (query.depth != null && typeof query.depth != "number")
            throw ternError(".query.depth must be a number");

        var result = {
            guess: infer.didGuess(),
            type: infer.toString(type, query.depth),
            name: type && type.name,
            exprName: exprName
        };
        if (type) storeTypeDocs(type, result);

        return clean(result);
    }

    function findDocs(_srv, query, file) {
        var expr = findExpr(file, query);
        var type = infer.expressionType(expr);
        var result = {
            url: type.url,
            doc: type.doc
        };
        var inner = type.getType();
        if (inner) storeTypeDocs(inner, result);
        return clean(result);
    }

    function storeTypeDocs(type, out) {
        if (!out.url) out.url = type.url;
        if (!out.doc) out.doc = type.doc;
        if (!out.origin) out.origin = type.origin;
        var ctor, boring = infer.cx().protos;
        if (!out.url && !out.doc && type.proto && (ctor = type.proto.hasCtor) &&
            type.proto != boring.Object && type.proto != boring.Function && type.proto != boring.Array) {
            out.url = ctor.url;
            out.doc = ctor.doc;
        }
    }

    var getSpan = exports.getSpan = function (obj) {
        if (!obj.origin) return;
        if (obj.originNode) {
            var node = obj.originNode;
            if (/^Function/.test(node.type) && node.id) node = node.id;
            return {
                origin: obj.origin,
                node: node
            };
        }
        if (obj.span) return {
            origin: obj.origin,
            span: obj.span
        };
    };

    var storeSpan = exports.storeSpan = function (srv, query, span, target) {
        target.origin = span.origin;
        if (span.span) {
            var m = /^(\d+)\[(\d+):(\d+)\]-(\d+)\[(\d+):(\d+)\]$/.exec(span.span);
            target.start = query.lineCharPositions ? {
                line: Number(m[2]),
                ch: Number(m[3])
            } : Number(m[1]);
            target.end = query.lineCharPositions ? {
                line: Number(m[5]),
                ch: Number(m[6])
            } : Number(m[4]);
        }
        else {
            var file = findFile(srv.files, span.origin);
            target.start = outputPos(query, file, span.node.start);
            target.end = outputPos(query, file, span.node.end);
        }
    };

    function findDef(srv, query, file) {
        //logO(query, 'query infindDef');// -- the query contains the current cursor position as ch/line
        var expr = findExpr(file, query); //finds expression as node from current CM cursor position
        // logO(expr, 'expr');//find the node that we are looking for
        infer.resetGuessing();
        var type = infer.expressionType(expr);
        if (infer.didGuess()) return {};

        var span = getSpan(type); //contains origin (file) and node        
        var result = {
            url: type.url,
            doc: type.doc,
            origin: type.origin
        };

        if (type.types)
            for (var i = type.types.length - 1; i >= 0; --i) {
                var tp = type.types[i];
                storeTypeDocs(tp, result);
                if (!span) span = getSpan(tp);
            }

        if (span && span.node) { // refers to a loaded file
            var spanFile = span.node.sourceFile || findFile(srv.files, span.origin);
            var start = outputPos(query, spanFile, span.node.start),
                end = outputPos(query, spanFile, span.node.end);
            result.start = start;
            result.end = end;
            result.file = span.origin;
            var cxStart = Math.max(0, span.node.start - 50);
            result.contextOffset = span.node.start - cxStart;
            result.context = spanFile.text.slice(cxStart, cxStart + 50);
        }
        else if (span) { // external
            result.file = span.origin;
            storeSpan(srv, query, span, result);
        }
        // logO(result, 'result');;
        return clean(result);
    }

    function findRefsToVariable(srv, query, file, expr, checkShadowing) {
        var name = expr.node.name;
        for (var scope = expr.state; scope && !(name in scope.props) ; scope = scope.prev) { }
        if (!scope) throw ternError("Could not find a definition for " + name + " " + !!srv.cx.topScope.props.x);

        var type, refs = [];

        function storeRef(file) {
            return function (node, scopeHere) {
                if (checkShadowing)
                    for (var s = scopeHere; s != scope; s = s.prev) {
                        var exists = s.hasProp(checkShadowing);
                        if (exists)
                            throw ternError("Renaming `" + name + "` to `" + checkShadowing + "` would make a variable at line " +
                                (asLineChar(file, node.start).line + 1) + " point to the definition at line " +
                                (asLineChar(file, exists.name.start).line + 1));
                    }
                refs.push({
                    file: file.name,
                    start: outputPos(query, file, node.start),
                    end: outputPos(query, file, node.end)
                });
            };
        }

        if (scope.node) {
            type = "local";
            if (checkShadowing) {
                for (var prev = scope.prev; prev; prev = prev.prev)
                    if (checkShadowing in prev.props) break;
                if (prev) infer.findRefs(scope.node, scope, checkShadowing, prev, function (node) {
                    throw ternError("Renaming `" + name + "` to `" + checkShadowing + "` would shadow the definition used at line " +
                        (asLineChar(file, node.start).line + 1));
                });
            }
            infer.findRefs(scope.node, scope, name, scope, storeRef(file));
        }
        else {
            type = "global";
            for (var i = 0; i < srv.files.length; ++i) {
                var cur = srv.files[i];
                infer.findRefs(cur.ast, cur.scope, name, scope, storeRef(cur));
            }
        }

        return {
            refs: refs,
            type: type,
            name: name
        };
    }

    function findRefsToProperty(srv, query, expr, prop) {
        var objType = infer.expressionType(expr).getType();
        if (!objType) throw ternError("Couldn't determine type of base object.");

        var refs = [];

        function storeRef(file) {
            return function (node) {
                refs.push({
                    file: file.name,
                    start: outputPos(query, file, node.start),
                    end: outputPos(query, file, node.end)
                });
            };
        }
        for (var i = 0; i < srv.files.length; ++i) {
            var cur = srv.files[i];
            infer.findPropRefs(cur.ast, cur.scope, objType, prop.name, storeRef(cur));
        }

        return {
            refs: refs,
            name: prop.name
        };
    }

    function findRefs(srv, query, file) {
        var expr = findExpr(file, query, true);
        if (expr && expr.node.type == "Identifier") {
            return findRefsToVariable(srv, query, file, expr);
        }
        else if (expr && expr.node.type == "MemberExpression" && !expr.node.computed) {
            var p = expr.node.property;
            expr.node = expr.node.object;
            return findRefsToProperty(srv, query, expr, p);
        }
        else if (expr && expr.node.type == "ObjectExpression") {
            var pos = resolvePos(file, query.end);
            for (var i = 0; i < expr.node.properties.length; ++i) {
                var k = expr.node.properties[i].key;
                if (k.start <= pos && k.end >= pos)
                    return findRefsToProperty(srv, query, expr, k);
            }
        }
        throw ternError("Not at a variable or property name.");
    }

    function buildRename(srv, query, file) {
        if (typeof query.newName != "string") throw ternError(".query.newName should be a string");
        var expr = findExpr(file, query);
        if (!expr || expr.node.type != "Identifier") throw ternError("Not at a variable.");

        var data = findRefsToVariable(srv, query, file, expr, query.newName),
            refs = data.refs;
        delete data.refs;
        data.files = srv.files.map(function (f) {
            return f.name;
        });

        var changes = data.changes = [];
        for (var i = 0; i < refs.length; ++i) {
            var use = refs[i];
            use.text = query.newName;
            changes.push(use);
        }

        return data;
    }

    function listFiles(srv) {
        return {
            files: srv.files.map(function (f) {
                return f.name;
            })
        };
    }

    exports.version = "0.5.1";
});

//#endregion


//#region tern/lib/def.js

// Type description parser
//
// Type description JSON files (such as ecma5.json and browser.json)
// are used to
//
// A) describe types that come from native code
//
// B) to cheaply load the types for big libraries, or libraries that
//    can't be inferred well

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return exports.init = mod;
    if (typeof define == "function" && define.amd) // AMD
        return define({ init: mod });
    tern.def = { init: mod };
})(function (exports, infer) {
    "use strict";

    function hop(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
    }

    var TypeParser = exports.TypeParser = function (spec, start, base, forceNew) {
        this.pos = start || 0;
        this.spec = spec;
        this.base = base;
        this.forceNew = forceNew;
    };
    TypeParser.prototype = {
        eat: function (str) {
            if (str.length == 1 ? this.spec.charAt(this.pos) == str : this.spec.indexOf(str, this.pos) == this.pos) {
                this.pos += str.length;
                return true;
            }
        },
        word: function (re) {
            var word = "", ch, re = re || /[\w$]/;
            while ((ch = this.spec.charAt(this.pos)) && re.test(ch)) { word += ch; ++this.pos; }
            return word;
        },
        error: function () {
            throw new Error("Unrecognized type spec: " + this.spec + " (at " + this.pos + ")");
        },
        parseFnType: function (name, top) {
            var args = [], names = [];
            if (!this.eat(")")) for (var i = 0; ; ++i) {
                var colon = this.spec.indexOf(": ", this.pos), argname;
                if (colon != -1) {
                    argname = this.spec.slice(this.pos, colon);
                    if (/^[$\w?]+$/.test(argname))
                        this.pos = colon + 2;
                    else
                        argname = null;
                }
                names.push(argname);
                args.push(this.parseType());
                if (!this.eat(", ")) {
                    this.eat(")") || this.error();
                    break;
                }
            }
            var retType, computeRet, computeRetStart, fn;
            if (this.eat(" -> ")) {
                if (top && this.spec.indexOf("!", this.pos) > -1) {
                    retType = infer.ANull;
                    computeRetStart = this.pos;
                    computeRet = this.parseRetType();
                } else retType = this.parseType();
            } else retType = infer.ANull;
            if (top && (fn = this.base))
                infer.Fn.call(this.base, name, infer.ANull, args, names, retType);
            else
                fn = new infer.Fn(name, infer.ANull, args, names, retType);
            if (computeRet) fn.computeRet = computeRet;
            if (computeRetStart != null) fn.computeRetSource = this.spec.slice(computeRetStart, this.pos);
            return fn;
        },
        parseType: function (name, top) {
            if (this.eat("fn(")) {
                return this.parseFnType(name, top);
            } else if (this.eat("[")) {
                var inner = this.parseType();
                if (inner == infer.ANull && this.spec == "[b.<i>]") {
                    var b = parsePath("b");
                    console.log(b.props["<i>"].types.length);
                }
                this.eat("]") || this.error();
                if (top && this.base) {
                    infer.Arr.call(this.base, inner);
                    return this.base;
                }
                return new infer.Arr(inner);
            } else if (this.eat("+")) {
                var path = this.word(/[\w$<>\.!]/);
                var base = parsePath(path + ".prototype");
                if (!(base instanceof infer.Obj)) base = parsePath(path);
                if (!(base instanceof infer.Obj)) return base;
                if (top && this.forceNew) return new infer.Obj(base);
                return infer.getInstance(base);
            } else if (this.eat("?")) {
                return infer.ANull;
            } else {
                return this.fromWord(this.word(/[\w$<>\.!`]/));
            }
        },
        fromWord: function (spec) {
            var cx = infer.cx();
            switch (spec) {
                case "number": return cx.num;
                case "string": return cx.str;
                case "bool": return cx.bool;
                case "<top>": return cx.topScope;
            }
            if (cx.localDefs && spec in cx.localDefs) return cx.localDefs[spec];
            return parsePath(spec);
        },
        parseBaseRetType: function () {
            if (this.eat("[")) {
                var inner = this.parseRetType();
                this.eat("]") || this.error();
                return function (self, args) { return new infer.Arr(inner(self, args)); };
            } else if (this.eat("+")) {
                var base = this.parseRetType();
                return function (self, args) { return infer.getInstance(base(self, args)); };
            } else if (this.eat("!")) {
                var arg = this.word(/\d/);
                if (arg) {
                    arg = Number(arg);
                    return function (_self, args) { return args[arg] || infer.ANull; };
                } else if (this.eat("this")) {
                    return function (self) { return self; };
                } else if (this.eat("custom:")) {
                    var fname = this.word(/[\w$]/);
                    return customFunctions[fname] || function () { return infer.ANull; };
                } else {
                    return this.fromWord("!" + arg + this.word(/[\w$<>\.!]/));
                }
            }
            var t = this.parseType();
            return function () { return t; };
        },
        extendRetType: function (base) {
            var propName = this.word(/[\w<>$!]/) || this.error();
            if (propName == "!ret") return function (self, args) {
                var lhs = base(self, args);
                if (lhs.retval) return lhs.retval;
                var rv = new infer.AVal;
                lhs.propagate(new infer.IsCallee(infer.ANull, [], null, rv));
                return rv;
            };
            return function (self, args) { return base(self, args).getProp(propName); };
        },
        parseRetType: function () {
            var tp = this.parseBaseRetType();
            while (this.eat(".")) tp = this.extendRetType(tp);
            return tp;
        }
    };

    function parseType(spec, name, base, forceNew) {
        var type = new TypeParser(spec, null, base, forceNew).parseType(name, true);
        if (/^fn\(/.test(spec)) for (var i = 0; i < type.args.length; ++i) (function (i) {
            var arg = type.args[i];
            if (arg instanceof infer.Fn && arg.args && arg.args.length) addEffect(type, function (_self, fArgs) {
                var fArg = fArgs[i];
                if (fArg) fArg.propagate(new infer.IsCallee(infer.cx().topScope, arg.args, null, infer.ANull));
            });
        })(i);
        return type;
    }

    function addEffect(fn, handler, replaceRet) {
        var oldCmp = fn.computeRet, rv = fn.retval;
        fn.computeRet = function (self, args, argNodes) {
            var handled = handler(self, args, argNodes);
            var old = oldCmp ? oldCmp(self, args, argNodes) : rv;
            return replaceRet ? handled : old;
        };
    }

    var parseEffect = exports.parseEffect = function (effect, fn) {
        var m;
        if (effect.indexOf("propagate ") == 0) {
            var p = new TypeParser(effect, 10);
            var getOrigin = p.parseRetType();
            if (!p.eat(" ")) p.error();
            var getTarget = p.parseRetType();
            addEffect(fn, function (self, args) {
                getOrigin(self, args).propagate(getTarget(self, args));
            });
        } else if (effect.indexOf("call ") == 0) {
            var andRet = effect.indexOf("and return ", 5) == 5;
            var p = new TypeParser(effect, andRet ? 16 : 5);
            var getCallee = p.parseRetType(), getSelf = null, getArgs = [];
            if (p.eat(" this=")) getSelf = p.parseRetType();
            while (p.eat(" ")) getArgs.push(p.parseRetType());
            addEffect(fn, function (self, args) {
                var callee = getCallee(self, args);
                var slf = getSelf ? getSelf(self, args) : infer.ANull, as = [];
                for (var i = 0; i < getArgs.length; ++i) as.push(getArgs[i](self, args));
                var result = andRet ? new infer.AVal : infer.ANull;
                callee.propagate(new infer.IsCallee(slf, as, null, result));
                return result;
            }, andRet);
        } else if (m = effect.match(/^custom (\S+)\s*(.*)/)) {
            var customFunc = customFunctions[m[1]];
            if (customFunc) addEffect(fn, m[2] ? customFunc(m[2]) : customFunc);
        } else if (effect.indexOf("copy ") == 0) {
            var p = new TypeParser(effect, 5);
            var getFrom = p.parseRetType();
            p.eat(" ");
            var getTo = p.parseRetType();
            addEffect(fn, function (self, args) {
                var from = getFrom(self, args), to = getTo(self, args);
                from.forAllProps(function (prop, val, local) {
                    if (local && prop != "<i>")
                        to.propagate(new infer.PropHasSubset(prop, val));
                });
            });
        } else {
            throw new Error("Unknown effect type: " + effect);
        }
    };

    var currentTopScope;

    var parsePath = exports.parsePath = function (path) {
        var cx = infer.cx(), cached = cx.paths[path], origPath = path;
        if (cached != null) return cached;
        cx.paths[path] = infer.ANull;

        var base = currentTopScope || cx.topScope;

        if (cx.localDefs) for (var name in cx.localDefs) {
            if (path.indexOf(name) == 0) {
                if (path == name) return cx.paths[path] = cx.localDefs[path];
                if (path.charAt(name.length) == ".") {
                    base = cx.localDefs[name];
                    path = path.slice(name.length + 1);
                    break;
                }
            }
        }

        var parts = path.split(".");
        for (var i = 0; i < parts.length && base != infer.ANull; ++i) {
            var prop = parts[i];
            if (prop.charAt(0) == "!") {
                if (prop == "!proto") {
                    base = (base instanceof infer.Obj && base.proto) || infer.ANull;
                } else {
                    var fn = base.getFunctionType();
                    if (!fn) {
                        base = infer.ANull;
                    } else if (prop == "!ret") {
                        base = fn.retval && fn.retval.getType(false) || infer.ANull;
                    } else {
                        var arg = fn.args && fn.args[Number(prop.slice(1))];
                        base = (arg && arg.getType(false)) || infer.ANull;
                    }
                }
            } else if (base instanceof infer.Obj) {
                var propVal = (prop == "prototype" && base instanceof infer.Fn) ? base.getProp(prop) : base.props[prop];
                if (!propVal || propVal.isEmpty())
                    base = infer.ANull;
                else
                    base = propVal.types[0];
            }
        }
        // Uncomment this to get feedback on your poorly written .json files
        // if (base == infer.ANull) console.error("bad path: " + origPath + " (" + cx.curOrigin + ")");
        cx.paths[origPath] = base == infer.ANull ? null : base;
        return base;
    };

    function emptyObj(ctor) {
        var empty = Object.create(ctor.prototype);
        empty.props = Object.create(null);
        empty.isShell = true;
        return empty;
    }

    function isSimpleAnnotation(spec) {
        if (!spec["!type"] || /^(fn\(|\[)/.test(spec["!type"])) return false;
        for (var prop in spec)
            if (prop != "!type" && prop != "!doc" && prop != "!url" && prop != "!span" && prop != "!data")
                return false;
        return true;
    }

    function passOne(base, spec, path) {
        if (!base) {
            var tp = spec["!type"];
            if (tp) {
                if (/^fn\(/.test(tp)) base = emptyObj(infer.Fn);
                else if (tp.charAt(0) == "[") base = emptyObj(infer.Arr);
                else throw new Error("Invalid !type spec: " + tp);
            } else if (spec["!stdProto"]) {
                base = infer.cx().protos[spec["!stdProto"]];
            } else {
                base = emptyObj(infer.Obj);
            }
            base.name = path;
        }

        for (var name in spec) if (hop(spec, name) && name.charCodeAt(0) != 33) {
            var inner = spec[name];
            if (typeof inner == "string" || isSimpleAnnotation(inner)) continue;
            var prop = base.defProp(name);
            passOne(prop.getType(false), inner, path ? path + "." + name : name).propagate(prop);
        }
        return base;
    }

    function passTwo(base, spec, path) {
        if (base.isShell) {
            delete base.isShell;
            var tp = spec["!type"];
            if (tp) {
                parseType(tp, path, base);
            } else {
                var proto = spec["!proto"] && parseType(spec["!proto"]);
                infer.Obj.call(base, proto instanceof infer.Obj ? proto : true, path);
            }
        }

        var effects = spec["!effects"];
        if (effects && base instanceof infer.Fn) for (var i = 0; i < effects.length; ++i)
            parseEffect(effects[i], base);
        copyInfo(spec, base);

        for (var name in spec) if (hop(spec, name) && name.charCodeAt(0) != 33) {
            var inner = spec[name], known = base.defProp(name), innerPath = path ? path + "." + name : name;
            var type = known.getType(false);
            if (typeof inner == "string") {
                if (type) continue;
                parseType(inner, innerPath).propagate(known);
            } else {
                if (!isSimpleAnnotation(inner)) {
                    passTwo(type, inner, innerPath);
                } else if (!type) {
                    parseType(inner["!type"], innerPath, null, true).propagate(known);
                    type = known.getType(false);
                    if (type instanceof infer.Obj) copyInfo(inner, type);
                } else continue;
                if (inner["!doc"]) known.doc = inner["!doc"];
                if (inner["!url"]) known.url = inner["!url"];
                if (inner["!span"]) known.span = inner["!span"];
            }
        }
    }

    function copyInfo(spec, type) {
        if (spec["!doc"]) type.doc = spec["!doc"];
        if (spec["!url"]) type.url = spec["!url"];
        if (spec["!span"]) type.span = spec["!span"];
        if (spec["!data"]) type.metaData = spec["!data"];
    }

    function runPasses(type, arg) {
        var parent = infer.cx().parent, pass = parent && parent.passes && parent.passes[type];
        if (pass) for (var i = 0; i < pass.length; i++) pass[i](arg);
    }

    function doLoadEnvironment(data, scope) {
        var cx = infer.cx();

        infer.addOrigin(cx.curOrigin = data["!name"] || "env#" + cx.origins.length);
        cx.localDefs = cx.definitions[cx.curOrigin] = Object.create(null);

        runPasses("preLoadDef", data);

        passOne(scope, data);

        var def = data["!define"];
        if (def) {
            for (var name in def) {
                var spec = def[name];
                cx.localDefs[name] = typeof spec == "string" ? parsePath(spec) : passOne(null, spec, name);
            }
            for (var name in def) {
                var spec = def[name];
                if (typeof spec != "string") passTwo(cx.localDefs[name], def[name], name);
            }
        }

        passTwo(scope, data);

        runPasses("postLoadDef", data);

        cx.curOrigin = cx.localDefs = null;
    }

    exports.load = function (data, scope) {
        if (!scope) scope = infer.cx().topScope;
        var oldScope = currentTopScope;
        currentTopScope = scope;
        try {
            doLoadEnvironment(data, scope);
        } finally {
            currentTopScope = oldScope;
        }
    };

    // Used to register custom logic for more involved effect or type
    // computation.
    var customFunctions = Object.create(null);
    infer.registerFunction = function (name, f) { customFunctions[name] = f; };

    var IsCreated = infer.constraint("created, target, spec", {
        addType: function (tp) {
            if (tp instanceof infer.Obj && this.created++ < 5) {
                var derived = new infer.Obj(tp), spec = this.spec;
                if (spec instanceof infer.AVal) spec = spec.getType(false);
                if (spec instanceof infer.Obj) for (var prop in spec.props) {
                    var cur = spec.props[prop].types[0];
                    var p = derived.defProp(prop);
                    if (cur && cur instanceof infer.Obj && cur.props.value) {
                        var vtp = cur.props.value.getType(false);
                        if (vtp) p.addType(vtp);
                    }
                }
                this.target.addType(derived);
            }
        }
    });

    infer.registerFunction("Object_create", function (_self, args, argNodes) {
        if (argNodes && argNodes.length && argNodes[0].type == "Literal" && argNodes[0].value == null)
            return new infer.Obj();

        var result = new infer.AVal;
        if (args[0]) args[0].propagate(new IsCreated(0, result, args[1]));
        return result;
    });

    var IsBound = infer.constraint("self, args, target", {
        addType: function (tp) {
            if (!(tp instanceof infer.Fn)) return;
            this.target.addType(new infer.Fn(tp.name, tp.self, tp.args.slice(this.args.length),
                                             tp.argNames.slice(this.args.length), tp.retval));
            this.self.propagate(tp.self);
            for (var i = 0; i < Math.min(tp.args.length, this.args.length) ; ++i)
                this.args[i].propagate(tp.args[i]);
        }
    });

    infer.registerFunction("Function_bind", function (self, args) {
        if (!args.length) return infer.ANull;
        var result = new infer.AVal;
        self.propagate(new IsBound(args[0], args.slice(1), result));
        return result;
    });

    infer.registerFunction("Array_ctor", function (_self, args) {
        var arr = new infer.Arr;
        if (args.length != 1 || !args[0].hasType(infer.cx().num)) {
            var content = arr.getProp("<i>");
            for (var i = 0; i < args.length; ++i) args[i].propagate(content);
        }
        return arr;
    });

    return exports;
});


//#endregion


//#region tern/lib/infer.js

// Main type inference engine

// Walks an AST, building up a graph of abstract values and contraints
// that cause types to flow from one node to another. Also defines a
// number of utilities for accessing ASTs and scopes.

// Analysis is done in a context, which is tracked by the dynamically
// bound cx variable. Use withContext to set the current context.

// For memory-saving reasons, individual types export an interface
// similar to abstract values (which can hold multiple types), and can
// thus be used in place abstract values that only ever contain a
// single type.

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return mod(exports, require("acorn/acorn"), require("acorn/acorn_loose"), require("acorn/util/walk"),
                   require("./def"), require("./signal"));
    if (typeof define == "function" && define.amd) // AMD
        return define(["exports", "acorn/acorn", "acorn/acorn_loose", "acorn/util/walk", "./def", "./signal"], mod);
    mod(self.tern || (self.tern = {}), acorn, acorn, acorn.walk, tern.def, tern.signal); // Plain browser env
})(function (exports, acorn, acorn_loose, walk, def, signal) {
    "use strict";

    var toString = exports.toString = function (type, maxDepth, parent) {
        return !type || type == parent ? "?" : type.toString(maxDepth);
    };

    // A variant of AVal used for unknown, dead-end values. Also serves
    // as prototype for AVals, Types, and Constraints because it
    // implements 'empty' versions of all the methods that the code
    // expects.
    var ANull = exports.ANull = signal.mixin({
        addType: function () { },
        propagate: function () { },
        getProp: function () { return ANull; },
        forAllProps: function () { },
        hasType: function () { return false; },
        isEmpty: function () { return true; },
        getFunctionType: function () { },
        getType: function () { },
        gatherProperties: function () { },
        propagatesTo: function () { },
        typeHint: function () { },
        propHint: function () { }
    });

    function extend(proto, props) {
        var obj = Object.create(proto);
        if (props) for (var prop in props) obj[prop] = props[prop];
        return obj;
    }

    // ABSTRACT VALUES

    var WG_DEFAULT = 100, WG_NEW_INSTANCE = 90, WG_MADEUP_PROTO = 10, WG_MULTI_MEMBER = 5,
        WG_CATCH_ERROR = 5, WG_GLOBAL_THIS = 90, WG_SPECULATIVE_THIS = 2;

    var AVal = exports.AVal = function () {
        this.types = [];
        this.forward = null;
        this.maxWeight = 0;
    };
    AVal.prototype = extend(ANull, {
        addType: function (type, weight) {
            weight = weight || WG_DEFAULT;
            if (this.maxWeight < weight) {
                this.maxWeight = weight;
                if (this.types.length == 1 && this.types[0] == type) return;
                this.types.length = 0;
            } else if (this.maxWeight > weight || this.types.indexOf(type) > -1) {
                return;
            }

            this.signal("addType", type);
            this.types.push(type);
            var forward = this.forward;
            if (forward) withWorklist(function (add) {
                for (var i = 0; i < forward.length; ++i) add(type, forward[i], weight);
            });
        },

        propagate: function (target, weight) {
            if (target == ANull || (target instanceof Type)) return;
            if (weight && weight < WG_DEFAULT) target = new Muffle(target, weight);
            (this.forward || (this.forward = [])).push(target);
            var types = this.types;
            if (types.length) withWorklist(function (add) {
                for (var i = 0; i < types.length; ++i) add(types[i], target, weight);
            });
        },

        getProp: function (prop) {
            if (prop == "__proto__" || prop == "✖") return ANull;
            var found = (this.props || (this.props = Object.create(null)))[prop];
            if (!found) {
                found = this.props[prop] = new AVal;
                this.propagate(new PropIsSubset(prop, found));
            }
            return found;
        },

        forAllProps: function (c) {
            this.propagate(new ForAllProps(c));
        },

        hasType: function (type) {
            return this.types.indexOf(type) > -1;
        },
        isEmpty: function () { return this.types.length == 0; },
        getFunctionType: function () {
            for (var i = this.types.length - 1; i >= 0; --i)
                if (this.types[i] instanceof Fn) return this.types[i];
        },

        getType: function (guess) {
            if (this.types.length == 0 && guess !== false) return this.makeupType();
            if (this.types.length == 1) return this.types[0];
            return canonicalType(this.types);
        },

        computedPropType: function () {
            if (!this.propertyOf || !this.propertyOf.hasProp("<i>")) return null;
            var computedProp = this.propertyOf.getProp("<i>");
            if (computedProp == this) return null;
            return computedProp.getType();
        },

        makeupType: function () {
            var computed = this.computedPropType();
            if (computed) return computed;

            if (!this.forward) return null;
            for (var i = this.forward.length - 1; i >= 0; --i) {
                var hint = this.forward[i].typeHint();
                if (hint && !hint.isEmpty()) { guessing = true; return hint; }
            }

            var props = Object.create(null), foundProp = null;
            for (var i = 0; i < this.forward.length; ++i) {
                var prop = this.forward[i].propHint();
                if (prop && prop != "length" && prop != "<i>" && prop != "✖") {
                    props[prop] = true;
                    foundProp = prop;
                }
            }
            if (!foundProp) return null;

            var objs = objsWithProp(foundProp);
            if (objs) {
                var matches = [];
                search: for (var i = 0; i < objs.length; ++i) {
                    var obj = objs[i];
                    for (var prop in props) if (!obj.hasProp(prop)) continue search;
                    if (obj.hasCtor) obj = getInstance(obj);
                    matches.push(obj);
                }
                var canon = canonicalType(matches);
                if (canon) { guessing = true; return canon; }
            }
        },

        typeHint: function () { return this.types.length ? this.getType() : null; },
        propagatesTo: function () { return this; },

        gatherProperties: function (f, depth) {
            for (var i = 0; i < this.types.length; ++i)
                this.types[i].gatherProperties(f, depth);
        },

        guessProperties: function (f) {
            if (this.forward) for (var i = 0; i < this.forward.length; ++i) {
                var prop = this.forward[i].propHint();
                if (prop) f(prop, null, 0);
            }
            var computed = this.computedPropType();
            if (computed) computed.gatherProperties(f);
        }
    });

    function canonicalType(types) {
        var arrays = 0, fns = 0, objs = 0, prim = null;
        for (var i = 0; i < types.length; ++i) {
            var tp = types[i];
            if (tp instanceof Arr)++arrays;
            else if (tp instanceof Fn)++fns;
            else if (tp instanceof Obj)++objs;
            else if (tp instanceof Prim) {
                if (prim && tp.name != prim.name) return null;
                prim = tp;
            }
        }
        var kinds = (arrays && 1) + (fns && 1) + (objs && 1) + (prim && 1);
        if (kinds > 1) return null;
        if (prim) return prim;

        var maxScore = 0, maxTp = null;
        for (var i = 0; i < types.length; ++i) {
            var tp = types[i], score = 0;
            if (arrays) {
                score = tp.getProp("<i>").isEmpty() ? 1 : 2;
            } else if (fns) {
                score = 1;
                for (var j = 0; j < tp.args.length; ++j) if (!tp.args[j].isEmpty())++score;
                if (!tp.retval.isEmpty())++score;
            } else if (objs) {
                score = tp.name ? 100 : 2;
            }
            if (score >= maxScore) { maxScore = score; maxTp = tp; }
        }
        return maxTp;
    }

    // PROPAGATION STRATEGIES

    function Constraint() { }
    Constraint.prototype = extend(ANull, {
        init: function () { this.origin = cx.curOrigin; }
    });

    var constraint = exports.constraint = function (props, methods) {
        var body = "this.init();";
        props = props ? props.split(", ") : [];
        for (var i = 0; i < props.length; ++i)
            body += "this." + props[i] + " = " + props[i] + ";";
        var ctor = Function.apply(null, props.concat([body]));
        ctor.prototype = Object.create(Constraint.prototype);
        for (var m in methods) if (methods.hasOwnProperty(m)) ctor.prototype[m] = methods[m];
        return ctor;
    };

    var PropIsSubset = constraint("prop, target", {
        addType: function (type, weight) {
            if (type.getProp)
                type.getProp(this.prop).propagate(this.target, weight);
        },
        propHint: function () { return this.prop; },
        propagatesTo: function () {
            if (this.prop == "<i>" || !/[^\w_]/.test(this.prop))
                return { target: this.target, pathExt: "." + this.prop };
        }
    });

    var PropHasSubset = exports.PropHasSubset = constraint("prop, type, originNode", {
        addType: function (type, weight) {
            if (!(type instanceof Obj)) return;
            var prop = type.defProp(this.prop, this.originNode);
            prop.origin = this.origin;
            this.type.propagate(prop, weight);
        },
        propHint: function () { return this.prop; }
    });

    var ForAllProps = constraint("c", {
        addType: function (type) {
            if (!(type instanceof Obj)) return;
            type.forAllProps(this.c);
        }
    });

    function withDisabledComputing(fn, body) {
        cx.disabledComputing = { fn: fn, prev: cx.disabledComputing };
        try {
            return body();
        } finally {
            cx.disabledComputing = cx.disabledComputing.prev;
        }
    }
    var IsCallee = exports.IsCallee = constraint("self, args, argNodes, retval", {
        init: function () {
            Constraint.prototype.init();
            this.disabled = cx.disabledComputing;
        },
        addType: function (fn, weight) {
            if (!(fn instanceof Fn)) return;
            for (var i = 0; i < this.args.length; ++i) {
                if (i < fn.args.length) this.args[i].propagate(fn.args[i], weight);
                if (fn.arguments) this.args[i].propagate(fn.arguments, weight);
            }
            this.self.propagate(fn.self, this.self == cx.topScope ? WG_GLOBAL_THIS : weight);
            var compute = fn.computeRet;
            if (compute) for (var d = this.disabled; d; d = d.prev)
                if (d.fn == fn || fn.name && d.fn.name == fn.name) compute = null;
            if (compute)
                compute(this.self, this.args, this.argNodes).propagate(this.retval, weight);
            else
                fn.retval.propagate(this.retval, weight);
        },
        typeHint: function () {
            var names = [];
            for (var i = 0; i < this.args.length; ++i) names.push("?");
            return new Fn(null, this.self, this.args, names, ANull);
        },
        propagatesTo: function () {
            return { target: this.retval, pathExt: ".!ret" };
        }
    });

    var HasMethodCall = constraint("propName, args, argNodes, retval", {
        init: function () {
            Constraint.prototype.init();
            this.disabled = cx.disabledComputing;
        },
        addType: function (obj, weight) {
            var callee = new IsCallee(obj, this.args, this.argNodes, this.retval);
            callee.disabled = this.disabled;
            obj.getProp(this.propName).propagate(callee, weight);
        },
        propHint: function () { return this.propName; }
    });

    var IsCtor = exports.IsCtor = constraint("target, noReuse", {
        addType: function (f, weight) {
            if (!(f instanceof Fn)) return;
            f.getProp("prototype").propagate(new IsProto(this.noReuse ? false : f, this.target), weight);
        }
    });

    var getInstance = exports.getInstance = function (obj, ctor) {
        if (ctor === false) return new Obj(obj);

        if (!ctor) ctor = obj.hasCtor;
        if (!obj.instances) obj.instances = [];
        for (var i = 0; i < obj.instances.length; ++i) {
            var cur = obj.instances[i];
            if (cur.ctor == ctor) return cur.instance;
        }
        var instance = new Obj(obj, ctor && ctor.name);
        instance.origin = obj.origin;
        obj.instances.push({ ctor: ctor, instance: instance });
        return instance;
    };

    var IsProto = exports.IsProto = constraint("ctor, target", {
        addType: function (o, _weight) {
            if (!(o instanceof Obj)) return;
            if ((this.count = (this.count || 0) + 1) > 8) return;
            if (o == cx.protos.Array)
                this.target.addType(new Arr);
            else
                this.target.addType(getInstance(o, this.ctor));
        }
    });

    var FnPrototype = constraint("fn", {
        addType: function (o, _weight) {
            if (o instanceof Obj && !o.hasCtor) {
                o.hasCtor = this.fn;
                var adder = new SpeculativeThis(o, this.fn);
                adder.addType(this.fn);
                o.forAllProps(function (_prop, val, local) {
                    if (local) val.propagate(adder);
                });
            }
        }
    });

    var IsAdded = constraint("other, target", {
        addType: function (type, weight) {
            if (type == cx.str)
                this.target.addType(cx.str, weight);
            else if (type == cx.num && this.other.hasType(cx.num))
                this.target.addType(cx.num, weight);
        },
        typeHint: function () { return this.other; }
    });

    var IfObj = exports.IfObj = constraint("target", {
        addType: function (t, weight) {
            if (t instanceof Obj) this.target.addType(t, weight);
        },
        propagatesTo: function () { return this.target; }
    });

    var SpeculativeThis = constraint("obj, ctor", {
        addType: function (tp) {
            if (tp instanceof Fn && tp.self && tp.self.isEmpty())
                tp.self.addType(getInstance(this.obj, this.ctor), WG_SPECULATIVE_THIS);
        }
    });

    var Muffle = constraint("inner, weight", {
        addType: function (tp, weight) {
            this.inner.addType(tp, Math.min(weight, this.weight));
        },
        propagatesTo: function () { return this.inner.propagatesTo(); },
        typeHint: function () { return this.inner.typeHint(); },
        propHint: function () { return this.inner.propHint(); }
    });

    // TYPE OBJECTS

    var Type = exports.Type = function () { };
    Type.prototype = extend(ANull, {
        constructor: Type,
        propagate: function (c, w) { c.addType(this, w); },
        hasType: function (other) { return other == this; },
        isEmpty: function () { return false; },
        typeHint: function () { return this; },
        getType: function () { return this; }
    });

    var Prim = exports.Prim = function (proto, name) { this.name = name; this.proto = proto; };
    Prim.prototype = extend(Type.prototype, {
        constructor: Prim,
        toString: function () { return this.name; },
        getProp: function (prop) { return this.proto.hasProp(prop) || ANull; },
        gatherProperties: function (f, depth) {
            if (this.proto) this.proto.gatherProperties(f, depth);
        }
    });

    var Obj = exports.Obj = function (proto, name) {
        if (!this.props) this.props = Object.create(null);
        this.proto = proto === true ? cx.protos.Object : proto;
        if (proto && !name && proto.name && !(this instanceof Fn)) {
            var match = /^(.*)\.prototype$/.exec(this.proto.name);
            if (match) name = match[1];
        }
        this.name = name;
        this.maybeProps = null;
        this.origin = cx.curOrigin;
    };
    Obj.prototype = extend(Type.prototype, {
        constructor: Obj,
        toString: function (maxDepth) {
            if (!maxDepth && this.name) return this.name;
            var props = [], etc = false;
            for (var prop in this.props) if (prop != "<i>") {
                if (props.length > 5) { etc = true; break; }
                if (maxDepth)
                    props.push(prop + ": " + toString(this.props[prop].getType(), maxDepth - 1));
                else
                    props.push(prop);
            }
            props.sort();
            if (etc) props.push("...");
            return "{" + props.join(", ") + "}";
        },
        hasProp: function (prop, searchProto) {
            var found = this.props[prop];
            if (searchProto !== false)
                for (var p = this.proto; p && !found; p = p.proto) found = p.props[prop];
            return found;
        },
        defProp: function (prop, originNode) {
            var found = this.hasProp(prop, false);
            if (found) {
                if (originNode && !found.originNode) found.originNode = originNode;
                return found;
            }
            if (prop == "__proto__" || prop == "✖") return ANull;

            var av = this.maybeProps && this.maybeProps[prop];
            if (av) {
                delete this.maybeProps[prop];
                this.maybeUnregProtoPropHandler();
            } else {
                av = new AVal;
                av.propertyOf = this;
            }

            this.props[prop] = av;
            av.originNode = originNode;
            av.origin = cx.curOrigin;
            this.broadcastProp(prop, av, true);
            return av;
        },
        getProp: function (prop) {
            var found = this.hasProp(prop, true) || (this.maybeProps && this.maybeProps[prop]);
            if (found) return found;
            if (prop == "__proto__" || prop == "✖") return ANull;
            var av = this.ensureMaybeProps()[prop] = new AVal;
            av.propertyOf = this;
            return av;
        },
        broadcastProp: function (prop, val, local) {
            if (local) {
                this.signal("addProp", prop, val);
                // If this is a scope, it shouldn't be registered
                if (!(this instanceof Scope)) registerProp(prop, this);
            }

            if (this.onNewProp) for (var i = 0; i < this.onNewProp.length; ++i) {
                var h = this.onNewProp[i];
                h.onProtoProp ? h.onProtoProp(prop, val, local) : h(prop, val, local);
            }
        },
        onProtoProp: function (prop, val, _local) {
            var maybe = this.maybeProps && this.maybeProps[prop];
            if (maybe) {
                delete this.maybeProps[prop];
                this.maybeUnregProtoPropHandler();
                this.proto.getProp(prop).propagate(maybe);
            }
            this.broadcastProp(prop, val, false);
        },
        ensureMaybeProps: function () {
            if (!this.maybeProps) {
                if (this.proto) this.proto.forAllProps(this);
                this.maybeProps = Object.create(null);
            }
            return this.maybeProps;
        },
        removeProp: function (prop) {
            var av = this.props[prop];
            delete this.props[prop];
            this.ensureMaybeProps()[prop] = av;
        },
        forAllProps: function (c) {
            if (!this.onNewProp) {
                this.onNewProp = [];
                if (this.proto) this.proto.forAllProps(this);
            }
            this.onNewProp.push(c);
            for (var o = this; o; o = o.proto) for (var prop in o.props) {
                if (c.onProtoProp)
                    c.onProtoProp(prop, o.props[prop], o == this);
                else
                    c(prop, o.props[prop], o == this);
            }
        },
        maybeUnregProtoPropHandler: function () {
            if (this.maybeProps) {
                for (var _n in this.maybeProps) return;
                this.maybeProps = null;
            }
            if (!this.proto || this.onNewProp && this.onNewProp.length) return;
            this.proto.unregPropHandler(this);
        },
        unregPropHandler: function (handler) {
            for (var i = 0; i < this.onNewProp.length; ++i)
                if (this.onNewProp[i] == handler) { this.onNewProp.splice(i, 1); break; }
            this.maybeUnregProtoPropHandler();
        },
        gatherProperties: function (f, depth) {
            for (var prop in this.props) if (prop != "<i>")
                f(prop, this, depth);
            if (this.proto) this.proto.gatherProperties(f, depth + 1);
        }
    });

    var Fn = exports.Fn = function (name, self, args, argNames, retval) {
        Obj.call(this, cx.protos.Function, name);
        this.self = self;
        this.args = args;
        this.argNames = argNames;
        this.retval = retval;
    };
    Fn.prototype = extend(Obj.prototype, {
        constructor: Fn,
        toString: function (maxDepth) {
            if (maxDepth) maxDepth--;
            var str = "fn(";
            for (var i = 0; i < this.args.length; ++i) {
                if (i) str += ", ";
                var name = this.argNames[i];
                if (name && name != "?") str += name + ": ";
                str += toString(this.args[i].getType(), maxDepth, this);
            }
            str += ")";
            if (!this.retval.isEmpty())
                str += " -> " + toString(this.retval.getType(), maxDepth, this);
            return str;
        },
        getProp: function (prop) {
            if (prop == "prototype") {
                var known = this.hasProp(prop, false);
                if (!known) {
                    known = this.defProp(prop);
                    var proto = new Obj(true, this.name && this.name + ".prototype");
                    proto.origin = this.origin;
                    known.addType(proto, WG_MADEUP_PROTO);
                }
                return known;
            }
            return Obj.prototype.getProp.call(this, prop);
        },
        defProp: function (prop, originNode) {
            if (prop == "prototype") {
                var found = this.hasProp(prop, false);
                if (found) return found;
                found = Obj.prototype.defProp.call(this, prop, originNode);
                found.origin = this.origin;
                found.propagate(new FnPrototype(this));
                return found;
            }
            return Obj.prototype.defProp.call(this, prop, originNode);
        },
        getFunctionType: function () { return this; }
    });

    var Arr = exports.Arr = function (contentType) {
        Obj.call(this, cx.protos.Array);
        var content = this.defProp("<i>");
        if (contentType) contentType.propagate(content);
    };
    Arr.prototype = extend(Obj.prototype, {
        constructor: Arr,
        toString: function (maxDepth) {
            return "[" + toString(this.getProp("<i>").getType(), maxDepth, this) + "]";
        }
    });

    // THE PROPERTY REGISTRY

    function registerProp(prop, obj) {
        var data = cx.props[prop] || (cx.props[prop] = []);
        data.push(obj);
    }

    function objsWithProp(prop) {
        return cx.props[prop];
    }

    // INFERENCE CONTEXT

    exports.Context = function (defs, parent) {
        this.parent = parent;
        this.props = Object.create(null);
        this.protos = Object.create(null);
        this.origins = [];
        this.curOrigin = "ecma5";
        this.paths = Object.create(null);
        this.definitions = Object.create(null);
        this.purgeGen = 0;
        this.workList = null;
        this.disabledComputing = null;

        exports.withContext(this, function () {
            cx.protos.Object = new Obj(null, "Object.prototype");
            cx.topScope = new Scope();
            cx.topScope.name = "<top>";
            cx.protos.Array = new Obj(true, "Array.prototype");
            cx.protos.Function = new Obj(true, "Function.prototype");
            cx.protos.RegExp = new Obj(true, "RegExp.prototype");
            cx.protos.String = new Obj(true, "String.prototype");
            cx.protos.Number = new Obj(true, "Number.prototype");
            cx.protos.Boolean = new Obj(true, "Boolean.prototype");
            cx.str = new Prim(cx.protos.String, "string");
            cx.bool = new Prim(cx.protos.Boolean, "bool");
            cx.num = new Prim(cx.protos.Number, "number");
            cx.curOrigin = null;

            if (defs) for (var i = 0; i < defs.length; ++i)
                def.load(defs[i]);
        });
    };

    var cx = null;
    exports.cx = function () { return cx; };

    exports.withContext = function (context, f) {
        var old = cx;
        cx = context;
        try { return f(); }
        finally { cx = old; }
    };

    exports.addOrigin = function (origin) {
        if (cx.origins.indexOf(origin) < 0) cx.origins.push(origin);
    };

    var baseMaxWorkDepth = 20, reduceMaxWorkDepth = .0001;
    function withWorklist(f) {
        if (cx.workList) return f(cx.workList);

        var list = [], depth = 0;
        var add = cx.workList = function (type, target, weight) {
            if (depth < baseMaxWorkDepth - reduceMaxWorkDepth * list.length)
                list.push(type, target, weight, depth);
        };
        try {
            var ret = f(add);
            for (var i = 0; i < list.length; i += 4) {
                depth = list[i + 3] + 1;
                list[i + 1].addType(list[i], list[i + 2]);
            }
            return ret;
        } finally {
            cx.workList = null;
        }
    }

    // SCOPES

    var Scope = exports.Scope = function (prev) {
        Obj.call(this, prev || true);
        this.prev = prev;
    };
    Scope.prototype = extend(Obj.prototype, {
        constructor: Scope,
        defVar: function (name, originNode) {
            for (var s = this; ; s = s.proto) {
                var found = s.props[name];
                if (found) return found;
                if (!s.prev) return s.defProp(name, originNode);
            }
        }
    });

    // RETVAL COMPUTATION HEURISTICS

    function maybeInstantiate(scope, score) {
        if (scope.fnType)
            scope.fnType.instantiateScore = (scope.fnType.instantiateScore || 0) + score;
    }

    var NotSmaller = {};
    function nodeSmallerThan(node, n) {
        try {
            walk.simple(node, { Expression: function () { if (--n <= 0) throw NotSmaller; } });
            return true;
        } catch (e) {
            if (e == NotSmaller) return false;
            throw e;
        }
    }

    function maybeTagAsInstantiated(node, scope) {
        var score = scope.fnType.instantiateScore;
        if (!cx.disabledComputing && score && scope.fnType.args.length && nodeSmallerThan(node, score * 5)) {
            maybeInstantiate(scope.prev, score / 2);
            setFunctionInstantiated(node, scope);
            return true;
        } else {
            scope.fnType.instantiateScore = null;
        }
    }

    function setFunctionInstantiated(node, scope) {
        var fn = scope.fnType;
        // Disconnect the arg avals, so that we can add info to them without side effects
        for (var i = 0; i < fn.args.length; ++i) fn.args[i] = new AVal;
        fn.self = new AVal;
        fn.computeRet = function (self, args) {
            // Prevent recursion
            return withDisabledComputing(fn, function () {
                var oldOrigin = cx.curOrigin;
                cx.curOrigin = fn.origin;
                var scopeCopy = new Scope(scope.prev);
                for (var v in scope.props) {
                    var local = scopeCopy.defProp(v);
                    for (var i = 0; i < args.length; ++i) if (fn.argNames[i] == v && i < args.length)
                        args[i].propagate(local);
                }
                var argNames = fn.argNames.length != args.length ? fn.argNames.slice(0, args.length) : fn.argNames;
                while (argNames.length < args.length) argNames.push("?");
                scopeCopy.fnType = new Fn(fn.name, self, args, argNames, ANull);
                if (fn.arguments) {
                    var argset = scopeCopy.fnType.arguments = new AVal;
                    scopeCopy.defProp("arguments").addType(new Arr(argset));
                    for (var i = 0; i < args.length; ++i) args[i].propagate(argset);
                }
                node.body.scope = scopeCopy;
                walk.recursive(node.body, scopeCopy, null, scopeGatherer);
                walk.recursive(node.body, scopeCopy, null, inferWrapper);
                cx.curOrigin = oldOrigin;
                return scopeCopy.fnType.retval;
            });
        };
    }

    function maybeTagAsGeneric(scope) {
        var fn = scope.fnType, target = fn.retval;
        if (target == ANull) return;
        var targetInner, asArray;
        if (!target.isEmpty() && (targetInner = target.getType()) instanceof Arr)
            target = asArray = targetInner.getProp("<i>");

        function explore(aval, path, depth) {
            if (depth > 3 || !aval.forward) return;
            for (var i = 0; i < aval.forward.length; ++i) {
                var prop = aval.forward[i].propagatesTo();
                if (!prop) continue;
                var newPath = path, dest;
                if (prop instanceof AVal) {
                    dest = prop;
                } else if (prop.target instanceof AVal) {
                    newPath += prop.pathExt;
                    dest = prop.target;
                } else continue;
                if (dest == target) return newPath;
                var found = explore(dest, newPath, depth + 1);
                if (found) return found;
            }
        }

        var foundPath = explore(fn.self, "!this", 0);
        for (var i = 0; !foundPath && i < fn.args.length; ++i)
            foundPath = explore(fn.args[i], "!" + i, 0);

        if (foundPath) {
            if (asArray) foundPath = "[" + foundPath + "]";
            var p = new def.TypeParser(foundPath);
            fn.computeRet = p.parseRetType();
            fn.computeRetSource = foundPath;
            return true;
        }
    }

    // SCOPE GATHERING PASS

    function addVar(scope, nameNode) {
        var val = scope.defProp(nameNode.name, nameNode);
        if (val.maybePurge) val.maybePurge = false;
        return val;
    }

    var scopeGatherer = walk.make({
        Function: function (node, scope, c) {
            var inner = node.body.scope = new Scope(scope);
            inner.node = node;
            var argVals = [], argNames = [];
            for (var i = 0; i < node.params.length; ++i) {
                var param = node.params[i];
                argNames.push(param.name);
                argVals.push(addVar(inner, param));
            }
            inner.fnType = new Fn(node.id && node.id.name, new AVal, argVals, argNames, ANull);
            inner.fnType.originNode = node;
            if (node.id) {
                var decl = node.type == "FunctionDeclaration";
                addVar(decl ? scope : inner, node.id);
            }
            c(node.body, inner, "ScopeBody");
        },
        TryStatement: function (node, scope, c) {
            c(node.block, scope, "Statement");
            if (node.handler) {
                var v = addVar(scope, node.handler.param);
                c(node.handler.body, scope, "ScopeBody");
                var e5 = cx.definitions.ecma5;
                if (e5 && v.isEmpty()) getInstance(e5["Error.prototype"]).propagate(v, WG_CATCH_ERROR);
            }
            if (node.finalizer) c(node.finalizer, scope, "Statement");
        },
        VariableDeclaration: function (node, scope, c) {
            for (var i = 0; i < node.declarations.length; ++i) {
                var decl = node.declarations[i];
                addVar(scope, decl.id);
                if (decl.init) c(decl.init, scope, "Expression");
            }
        }
    });

    // CONSTRAINT GATHERING PASS

    function propName(node, scope, c) {
        var prop = node.property;
        if (!node.computed) return prop.name;
        if (prop.type == "Literal" && typeof prop.value == "string") return prop.value;
        if (c) infer(prop, scope, c, ANull);
        return "<i>";
    }

    function unopResultType(op) {
        switch (op) {
            case "+": case "-": case "~": return cx.num;
            case "!": return cx.bool;
            case "typeof": return cx.str;
            case "void": case "delete": return ANull;
        }
    }
    function binopIsBoolean(op) {
        switch (op) {
            case "==": case "!=": case "===": case "!==": case "<": case ">": case ">=": case "<=":
            case "in": case "instanceof": return true;
        }
    }
    function literalType(val) {
        switch (typeof val) {
            case "boolean": return cx.bool;
            case "number": return cx.num;
            case "string": return cx.str;
            case "object":
            case "function":
                if (!val) return ANull;
                return getInstance(cx.protos.RegExp);
        }
    }

    function ret(f) {
        return function (node, scope, c, out, name) {
            var r = f(node, scope, c, name);
            if (out) r.propagate(out);
            return r;
        };
    }
    function fill(f) {
        return function (node, scope, c, out, name) {
            if (!out) out = new AVal;
            f(node, scope, c, out, name);
            return out;
        };
    }

    var inferExprVisitor = {
        ArrayExpression: ret(function (node, scope, c) {
            var eltval = new AVal;
            for (var i = 0; i < node.elements.length; ++i) {
                var elt = node.elements[i];
                if (elt) infer(elt, scope, c, eltval);
            }
            return new Arr(eltval);
        }),
        ObjectExpression: ret(function (node, scope, c, name) {
            var obj = node.objType = new Obj(true, name);
            obj.originNode = node;

            for (var i = 0; i < node.properties.length; ++i) {
                var prop = node.properties[i], key = prop.key, name;
                if (key.type == "Identifier") {
                    name = key.name;
                } else if (typeof key.value == "string") {
                    name = key.value;
                } else {
                    infer(prop.value, scope, c, ANull);
                    continue;
                }
                var val = obj.defProp(name, key);
                val.initializer = true;
                infer(prop.value, scope, c, val, name);
            }
            return obj;
        }),
        FunctionExpression: ret(function (node, scope, c, name) {
            var inner = node.body.scope, fn = inner.fnType;
            if (name && !fn.name) fn.name = name;
            c(node.body, scope, "ScopeBody");
            maybeTagAsInstantiated(node, inner) || maybeTagAsGeneric(inner);
            if (node.id) inner.getProp(node.id.name).addType(fn);
            return fn;
        }),
        SequenceExpression: ret(function (node, scope, c) {
            for (var i = 0, l = node.expressions.length - 1; i < l; ++i)
                infer(node.expressions[i], scope, c, ANull);
            return infer(node.expressions[l], scope, c);
        }),
        UnaryExpression: ret(function (node, scope, c) {
            infer(node.argument, scope, c, ANull);
            return unopResultType(node.operator);
        }),
        UpdateExpression: ret(function (node, scope, c) {
            infer(node.argument, scope, c, ANull);
            return cx.num;
        }),
        BinaryExpression: ret(function (node, scope, c) {
            if (node.operator == "+") {
                var lhs = infer(node.left, scope, c);
                var rhs = infer(node.right, scope, c);
                if (lhs.hasType(cx.str) || rhs.hasType(cx.str)) return cx.str;
                if (lhs.hasType(cx.num) && rhs.hasType(cx.num)) return cx.num;
                var result = new AVal;
                lhs.propagate(new IsAdded(rhs, result));
                rhs.propagate(new IsAdded(lhs, result));
                return result;
            } else {
                infer(node.left, scope, c, ANull);
                infer(node.right, scope, c, ANull);
                return binopIsBoolean(node.operator) ? cx.bool : cx.num;
            }
        }),
        AssignmentExpression: ret(function (node, scope, c) {
            var rhs, name, pName;
            if (node.left.type == "MemberExpression") {
                pName = propName(node.left, scope, c);
                if (node.left.object.type == "Identifier")
                    name = node.left.object.name + "." + pName;
            } else {
                name = node.left.name;
            }

            if (node.operator != "=" && node.operator != "+=") {
                infer(node.right, scope, c, ANull);
                rhs = cx.num;
            } else {
                rhs = infer(node.right, scope, c, null, name);
            }

            if (node.left.type == "MemberExpression") {
                var obj = infer(node.left.object, scope, c);
                if (pName == "prototype") maybeInstantiate(scope, 20);
                if (pName == "<i>") {
                    // This is a hack to recognize for/in loops that copy
                    // properties, and do the copying ourselves, insofar as we
                    // manage, because such loops tend to be relevant for type
                    // information.
                    var v = node.left.property.name, local = scope.props[v], over = local && local.iteratesOver;
                    if (over) {
                        maybeInstantiate(scope, 20);
                        var fromRight = node.right.type == "MemberExpression" && node.right.computed && node.right.property.name == v;
                        over.forAllProps(function (prop, val, local) {
                            if (local && prop != "prototype" && prop != "<i>")
                                obj.propagate(new PropHasSubset(prop, fromRight ? val : ANull));
                        });
                        return rhs;
                    }
                }
                obj.propagate(new PropHasSubset(pName, rhs, node.left.property));
            } else { // Identifier
                var v = scope.defVar(node.left.name, node.left);
                if (v.maybePurge) v.maybePurge = false;
                rhs.propagate(v);
            }
            return rhs;
        }),
        LogicalExpression: fill(function (node, scope, c, out) {
            infer(node.left, scope, c, out);
            infer(node.right, scope, c, out);
        }),
        ConditionalExpression: fill(function (node, scope, c, out) {
            infer(node.test, scope, c, ANull);
            infer(node.consequent, scope, c, out);
            infer(node.alternate, scope, c, out);
        }),
        NewExpression: fill(function (node, scope, c, out, name) {
            if (node.callee.type == "Identifier" && node.callee.name in scope.props)
                maybeInstantiate(scope, 20);

            for (var i = 0, args = []; i < node.arguments.length; ++i)
                args.push(infer(node.arguments[i], scope, c));
            var callee = infer(node.callee, scope, c);
            var self = new AVal;
            callee.propagate(new IsCtor(self, name && /\.prototype$/.test(name)));
            self.propagate(out, WG_NEW_INSTANCE);
            callee.propagate(new IsCallee(self, args, node.arguments, new IfObj(out)));
        }),
        CallExpression: fill(function (node, scope, c, out) {
            for (var i = 0, args = []; i < node.arguments.length; ++i)
                args.push(infer(node.arguments[i], scope, c));
            if (node.callee.type == "MemberExpression") {
                var self = infer(node.callee.object, scope, c);
                var pName = propName(node.callee, scope, c);
                if ((pName == "call" || pName == "apply") &&
                    scope.fnType && scope.fnType.args.indexOf(self) > -1)
                    maybeInstantiate(scope, 30);
                self.propagate(new HasMethodCall(pName, args, node.arguments, out));
            } else {
                var callee = infer(node.callee, scope, c);
                if (scope.fnType && scope.fnType.args.indexOf(callee) > -1)
                    maybeInstantiate(scope, 30);
                var knownFn = callee.getFunctionType();
                if (knownFn && knownFn.instantiateScore && scope.fnType)
                    maybeInstantiate(scope, knownFn.instantiateScore / 5);
                callee.propagate(new IsCallee(cx.topScope, args, node.arguments, out));
            }
        }),
        MemberExpression: fill(function (node, scope, c, out) {
            var name = propName(node, scope);
            var obj = infer(node.object, scope, c);
            var prop = obj.getProp(name);
            if (name == "<i>") {
                var propType = infer(node.property, scope, c);
                if (!propType.hasType(cx.num))
                    return prop.propagate(out, WG_MULTI_MEMBER);
            }
            prop.propagate(out);
        }),
        Identifier: ret(function (node, scope) {
            if (node.name == "arguments" && scope.fnType && !(node.name in scope.props))
                scope.defProp(node.name, scope.fnType.originNode)
                  .addType(new Arr(scope.fnType.arguments = new AVal));
            return scope.getProp(node.name);
        }),
        ThisExpression: ret(function (_node, scope) {
            return scope.fnType ? scope.fnType.self : cx.topScope;
        }),
        Literal: ret(function (node) {
            return literalType(node.value);
        })
    };

    function infer(node, scope, c, out, name) {
        return inferExprVisitor[node.type](node, scope, c, out, name);
    }

    var inferWrapper = walk.make({
        Expression: function (node, scope, c) {
            infer(node, scope, c, ANull);
        },

        FunctionDeclaration: function (node, scope, c) {
            var inner = node.body.scope, fn = inner.fnType;
            c(node.body, scope, "ScopeBody");
            maybeTagAsInstantiated(node, inner) || maybeTagAsGeneric(inner);
            var prop = scope.getProp(node.id.name);
            prop.addType(fn);
        },

        VariableDeclaration: function (node, scope, c) {
            for (var i = 0; i < node.declarations.length; ++i) {
                var decl = node.declarations[i], prop = scope.getProp(decl.id.name);
                if (decl.init)
                    infer(decl.init, scope, c, prop, decl.id.name);
            }
        },

        ReturnStatement: function (node, scope, c) {
            if (!node.argument) return;
            var output = ANull;
            if (scope.fnType) {
                if (scope.fnType.retval == ANull) scope.fnType.retval = new AVal;
                output = scope.fnType.retval;
            }
            infer(node.argument, scope, c, output);
        },

        ForInStatement: function (node, scope, c) {
            var source = infer(node.right, scope, c);
            if ((node.right.type == "Identifier" && node.right.name in scope.props) ||
                (node.right.type == "MemberExpression" && node.right.property.name == "prototype")) {
                maybeInstantiate(scope, 5);
                var varName;
                if (node.left.type == "Identifier") {
                    varName = node.left.name;
                } else if (node.left.type == "VariableDeclaration") {
                    varName = node.left.declarations[0].id.name;
                }
                if (varName && varName in scope.props)
                    scope.getProp(varName).iteratesOver = source;
            }
            c(node.body, scope, "Statement");
        },

        ScopeBody: function (node, scope, c) { c(node, node.scope || scope); }
    });

    // PARSING

    function runPasses(passes, pass) {
        var arr = passes && passes[pass];
        var args = Array.prototype.slice.call(arguments, 2);
        if (arr) for (var i = 0; i < arr.length; ++i) arr[i].apply(null, args);
    }

    var parse = exports.parse = function (text, passes, options) {
        var ast;
        try { ast = acorn.parse(text, options); }
        catch (e) { ast = acorn_loose.parse_dammit(text, options); }
        runPasses(passes, "postParse", ast, text);
        return ast;
    };

    // ANALYSIS INTERFACE

    exports.analyze = function (ast, name, scope, passes) {
        if (typeof ast == "string") ast = parse(ast);

        if (!name) name = "file#" + cx.origins.length;
        exports.addOrigin(cx.curOrigin = name);

        if (!scope) scope = cx.topScope;
        walk.recursive(ast, scope, null, scopeGatherer);
        runPasses(passes, "preInfer", ast, scope);
        walk.recursive(ast, scope, null, inferWrapper);
        runPasses(passes, "postInfer", ast, scope);

        cx.curOrigin = null;
    };

    // PURGING

    exports.purgeTypes = function (origins, start, end) {
        var test = makePredicate(origins, start, end);
        ++cx.purgeGen;
        cx.topScope.purge(test);
        for (var prop in cx.props) {
            var list = cx.props[prop];
            for (var i = 0; i < list.length; ++i) {
                var obj = list[i], av = obj.props[prop];
                if (!av || test(av, av.originNode)) list.splice(i--, 1);
            }
            if (!list.length) delete cx.props[prop];
        }
    };

    function makePredicate(origins, start, end) {
        var arr = Array.isArray(origins);
        if (arr && origins.length == 1) { origins = origins[0]; arr = false; }
        if (arr) {
            if (end == null) return function (n) { return origins.indexOf(n.origin) > -1; };
            return function (n, pos) { return pos && pos.start >= start && pos.end <= end && origins.indexOf(n.origin) > -1; };
        } else {
            if (end == null) return function (n) { return n.origin == origins; };
            return function (n, pos) { return pos && pos.start >= start && pos.end <= end && n.origin == origins; };
        }
    }

    AVal.prototype.purge = function (test) {
        if (this.purgeGen == cx.purgeGen) return;
        this.purgeGen = cx.purgeGen;
        for (var i = 0; i < this.types.length; ++i) {
            var type = this.types[i];
            if (test(type, type.originNode))
                this.types.splice(i--, 1);
            else
                type.purge(test);
        }
        if (this.forward) for (var i = 0; i < this.forward.length; ++i) {
            var f = this.forward[i];
            if (test(f)) {
                this.forward.splice(i--, 1);
                if (this.props) this.props = null;
            } else if (f.purge) {
                f.purge(test);
            }
        }
    };
    ANull.purge = function () { };
    Obj.prototype.purge = function (test) {
        if (this.purgeGen == cx.purgeGen) return true;
        this.purgeGen = cx.purgeGen;
        for (var p in this.props) {
            var av = this.props[p];
            if (test(av, av.originNode))
                this.removeProp(p);
            av.purge(test);
        }
    };
    Fn.prototype.purge = function (test) {
        if (Obj.prototype.purge.call(this, test)) return;
        this.self.purge(test);
        this.retval.purge(test);
        for (var i = 0; i < this.args.length; ++i) this.args[i].purge(test);
    };

    exports.markVariablesDefinedBy = function (scope, origins, start, end) {
        var test = makePredicate(origins, start, end);
        for (var s = scope; s; s = s.prev) for (var p in s.props) {
            var prop = s.props[p];
            if (test(prop, prop.originNode)) {
                prop.maybePurge = true;
                if (start == null && prop.originNode) prop.originNode = null;
            }
        }
    };

    exports.purgeMarkedVariables = function (scope) {
        for (var s = scope; s; s = s.prev) for (var p in s.props)
            if (s.props[p].maybePurge) delete s.props[p];
    };

    // EXPRESSION TYPE DETERMINATION

    function findByPropertyName(name) {
        guessing = true;
        var found = objsWithProp(name);
        if (found) for (var i = 0; i < found.length; ++i) {
            var val = found[i].getProp(name);
            if (!val.isEmpty()) return val;
        }
        return ANull;
    }

    var typeFinder = {
        ArrayExpression: function (node, scope) {
            var eltval = new AVal;
            for (var i = 0; i < node.elements.length; ++i) {
                var elt = node.elements[i];
                if (elt) findType(elt, scope).propagate(eltval);
            }
            return new Arr(eltval);
        },
        ObjectExpression: function (node) {
            return node.objType;
        },
        FunctionExpression: function (node) {
            return node.body.scope.fnType;
        },
        SequenceExpression: function (node, scope) {
            return findType(node.expressions[node.expressions.length - 1], scope);
        },
        UnaryExpression: function (node) {
            return unopResultType(node.operator);
        },
        UpdateExpression: function () {
            return cx.num;
        },
        BinaryExpression: function (node, scope) {
            if (binopIsBoolean(node.operator)) return cx.bool;
            if (node.operator == "+") {
                var lhs = findType(node.left, scope);
                var rhs = findType(node.right, scope);
                if (lhs.hasType(cx.str) || rhs.hasType(cx.str)) return cx.str;
            }
            return cx.num;
        },
        AssignmentExpression: function (node, scope) {
            return findType(node.right, scope);
        },
        LogicalExpression: function (node, scope) {
            var lhs = findType(node.left, scope);
            return lhs.isEmpty() ? findType(node.right, scope) : lhs;
        },
        ConditionalExpression: function (node, scope) {
            var lhs = findType(node.consequent, scope);
            return lhs.isEmpty() ? findType(node.alternate, scope) : lhs;
        },
        NewExpression: function (node, scope) {
            var f = findType(node.callee, scope).getFunctionType();
            var proto = f && f.getProp("prototype").getType();
            if (!proto) return ANull;
            return getInstance(proto, f);
        },
        CallExpression: function (node, scope) {
            var f = findType(node.callee, scope).getFunctionType();
            if (!f) return ANull;
            if (f.computeRet) {
                for (var i = 0, args = []; i < node.arguments.length; ++i)
                    args.push(findType(node.arguments[i], scope));
                var self = ANull;
                if (node.callee.type == "MemberExpression")
                    self = findType(node.callee.object, scope);
                return f.computeRet(self, args, node.arguments);
            } else {
                return f.retval;
            }
        },
        MemberExpression: function (node, scope) {
            var propN = propName(node, scope), obj = findType(node.object, scope).getType();
            if (obj) return obj.getProp(propN);
            if (propN == "<i>") return ANull;
            return findByPropertyName(propN);
        },
        Identifier: function (node, scope) {
            return scope.hasProp(node.name) || ANull;
        },
        ThisExpression: function (_node, scope) {
            return scope.fnType ? scope.fnType.self : cx.topScope;
        },
        Literal: function (node) {
            return literalType(node.value);
        }
    };

    function findType(node, scope) {
        var found = typeFinder[node.type](node, scope);
        return found;
    }

    var searchVisitor = exports.searchVisitor = walk.make({
        Function: function (node, _st, c) {
            var scope = node.body.scope;
            if (node.id) c(node.id, scope);
            for (var i = 0; i < node.params.length; ++i)
                c(node.params[i], scope);
            c(node.body, scope, "ScopeBody");
        },
        TryStatement: function (node, st, c) {
            if (node.handler)
                c(node.handler.param, st);
            walk.base.TryStatement(node, st, c);
        },
        VariableDeclaration: function (node, st, c) {
            for (var i = 0; i < node.declarations.length; ++i) {
                var decl = node.declarations[i];
                c(decl.id, st);
                if (decl.init) c(decl.init, st, "Expression");
            }
        }
    });
    exports.fullVisitor = walk.make({
        MemberExpression: function (node, st, c) {
            c(node.object, st, "Expression");
            c(node.property, st, node.computed ? "Expression" : null);
        },
        ObjectExpression: function (node, st, c) {
            for (var i = 0; i < node.properties.length; ++i) {
                c(node.properties[i].value, st, "Expression");
                c(node.properties[i].key, st);
            }
        }
    }, searchVisitor);

    exports.findExpressionAt = function (ast, start, end, defaultScope, filter) {
        var test = filter || function (_t, node) { return typeFinder.hasOwnProperty(node.type); };
        return walk.findNodeAt(ast, start, end, test, searchVisitor, defaultScope || cx.topScope);
    };

    exports.findExpressionAround = function (ast, start, end, defaultScope, filter) {
        var test = filter || function (_t, node) {
            if (start != null && node.start > start) return false;
            return typeFinder.hasOwnProperty(node.type);
        };
        return walk.findNodeAround(ast, end, test, searchVisitor, defaultScope || cx.topScope);
    };

    exports.expressionType = function (found) {
        return findType(found.node, found.state);
    };

    // Flag used to indicate that some wild guessing was used to produce
    // a type or set of completions.
    var guessing = false;

    exports.resetGuessing = function (val) { guessing = val; };
    exports.didGuess = function () { return guessing; };

    exports.forAllPropertiesOf = function (type, f) {
        type.gatherProperties(f, 0);
    };

    var refFindWalker = walk.make({}, searchVisitor);

    exports.findRefs = function (ast, baseScope, name, refScope, f) {
        refFindWalker.Identifier = function (node, scope) {
            if (node.name != name) return;
            for (var s = scope; s; s = s.prev) {
                if (s == refScope) f(node, scope);
                if (name in s.props) return;
            }
        };
        walk.recursive(ast, baseScope, null, refFindWalker);
    };

    var simpleWalker = walk.make({
        Function: function (node, _st, c) { c(node.body, node.body.scope, "ScopeBody"); }
    });

    exports.findPropRefs = function (ast, scope, objType, propName, f) {
        walk.simple(ast, {
            MemberExpression: function (node, scope) {
                if (node.computed || node.property.name != propName) return;
                if (findType(node.object, scope).getType() == objType) f(node.property);
            },
            ObjectExpression: function (node, scope) {
                if (findType(node, scope).getType() != objType) return;
                for (var i = 0; i < node.properties.length; ++i)
                    if (node.properties[i].key.name == propName) f(node.properties[i].key);
            }
        }, simpleWalker, scope);
    };

    // LOCAL-VARIABLE QUERIES

    var scopeAt = exports.scopeAt = function (ast, pos, defaultScope) {
        var found = walk.findNodeAround(ast, pos, function (tp, node) {
            return tp == "ScopeBody" && node.scope;
        });
        if (found) return found.node.scope;
        else return defaultScope || cx.topScope;
    };

    exports.forAllLocalsAt = function (ast, pos, defaultScope, f) {
        var scope = scopeAt(ast, pos, defaultScope);
        scope.gatherProperties(f, 0);
    };

    // INIT DEF MODULE

    // Delayed initialization because of cyclic dependencies.
    def = exports.def = def.init({}, exports);
});


//#endregion


//#region tern/lib/comment.js

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return mod(exports);
    if (typeof define == "function" && define.amd) // AMD
        return define(["exports"], mod);
    mod(tern.comment || (tern.comment = {}));
})(function (exports) {
    function isSpace(ch) {
        return (ch < 14 && ch > 8) || ch === 32 || ch === 160;
    }

    function onOwnLine(text, pos) {
        for (; pos > 0; --pos) {
            var ch = text.charCodeAt(pos - 1);
            if (ch == 10) break;
            if (!isSpace(ch)) return false;
        }
        return true;
    }

    // Gather comments directly before a function
    exports.commentsBefore = function (text, pos) {
        var found = null, emptyLines = 0, topIsLineComment;
        out: while (pos > 0) {
            var prev = text.charCodeAt(pos - 1);
            if (prev == 10) {
                for (var scan = --pos, sawNonWS = false; scan > 0; --scan) {
                    prev = text.charCodeAt(scan - 1);
                    if (prev == 47 && text.charCodeAt(scan - 2) == 47) {
                        if (!onOwnLine(text, scan - 2)) break out;
                        var content = text.slice(scan, pos);
                        if (!emptyLines && topIsLineComment) found[0] = content + "\n" + found[0];
                        else (found || (found = [])).unshift(content);
                        topIsLineComment = true;
                        emptyLines = 0;
                        pos = scan - 2;
                        break;
                    } else if (prev == 10) {
                        if (!sawNonWS && ++emptyLines > 1) break out;
                        break;
                    } else if (!sawNonWS && !isSpace(prev)) {
                        sawNonWS = true;
                    }
                }
            } else if (prev == 47 && text.charCodeAt(pos - 2) == 42) {
                for (var scan = pos - 2; scan > 1; --scan) {
                    if (text.charCodeAt(scan - 1) == 42 && text.charCodeAt(scan - 2) == 47) {
                        if (!onOwnLine(text, scan - 2)) break out;
                        (found || (found = [])).unshift(text.slice(scan, pos - 2));
                        topIsLineComment = false;
                        emptyLines = 0;
                        break;
                    }
                }
                pos = scan - 2;
            } else if (isSpace(prev)) {
                --pos;
            } else {
                break;
            }
        }
        return found;
    };

    exports.commentAfter = function (text, pos) {
        while (pos < text.length) {
            var next = text.charCodeAt(pos);
            if (next == 47) {
                var after = text.charCodeAt(pos + 1), end;
                if (after == 47) // line comment
                    end = text.indexOf("\n", pos + 2);
                else if (after == 42) // block comment
                    end = text.indexOf("*/", pos + 2);
                else
                    return;
                return text.slice(pos + 2, end < 0 ? text.length : end);
            } else if (isSpace(next)) {
                ++pos;
            }
        }
    };

    exports.ensureCommentsBefore = function (text, node) {
        if (node.hasOwnProperty("commentsBefore")) return node.commentsBefore;
        return node.commentsBefore = exports.commentsBefore(text, node.start);
    };
});


//#endregion


//#region tern/plugin/doc_comment.js
// Parses comments above variable declarations, function declarations,
// and object properties as docstrings and JSDoc-style type
// annotations.

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return mod(require("../lib/infer"), require("../lib/tern"), require("../lib/comment"),
              require("acorn/util/walk"));
    if (typeof define == "function" && define.amd) // AMD
        return define(["../lib/infer", "../lib/tern", "../lib/comment", "acorn/util/walk"], mod);
    mod(tern, tern, tern.comment, acorn.walk);
})(function (infer, tern, comment, walk) {
    "use strict";
    tern.registerPlugin("doc_comment", function () {
        return {
            passes: {
                "postParse": postParse,
                "postInfer": postInfer
            }
        };
    });

    function postParse(ast, text) {
        function attachComments(node) { comment.ensureCommentsBefore(text, node); }

        walk.simple(ast, {
            VariableDeclaration: attachComments,
            FunctionDeclaration: attachComments,
            AssignmentExpression: function (node) {
                if (node.operator == "=") attachComments(node);
            },
            ObjectExpression: function (node) {
                for (var i = 0; i < node.properties.length; ++i)
                    attachComments(node.properties[i].key);
            }
        });
    }

    function postInfer(ast, scope) {
        walk.simple(ast, {
            VariableDeclaration: function (node, scope) {
                if (node.commentsBefore)
                    interpretComments(node, node.commentsBefore, scope,
                                      scope.getProp(node.declarations[0].id.name));
            },
            FunctionDeclaration: function (node, scope) {
                if (node.commentsBefore)
                    interpretComments(node, node.commentsBefore, scope,
                                      scope.getProp(node.id.name),
                                      node.body.scope.fnType);
            },
            AssignmentExpression: function (node, scope) {
                if (node.commentsBefore)
                    interpretComments(node, node.commentsBefore, scope,
                                      infer.expressionType({ node: node.left, state: scope }));
            },
            ObjectExpression: function (node, scope) {
                for (var i = 0; i < node.properties.length; ++i) {
                    var prop = node.properties[i], key = prop.key;
                    if (key.commentsBefore)
                        interpretComments(prop, key.commentsBefore, scope,
                                          node.objType.getProp(key.name));
                }
            }
        }, infer.searchVisitor, scope);
    }

    // COMMENT INTERPRETATION

    function interpretComments(node, comments, scope, aval, type) {
        //logO(comments, 'comments');
        jsdocInterpretComments(node, scope, aval, comments);

        if (!type && aval instanceof infer.AVal && aval.types.length) {
            type = aval.types[aval.types.length - 1];
            if (!(type instanceof infer.Obj) || type.origin != infer.cx().curOrigin || type.doc)
                type = null;
        }

        var first = comments[0], dot = first.search(/\.\s/);
        if (dot > 5) first = first.slice(0, dot + 1);
        first = first.trim().replace(/\s*\n\s*\*\s*|\s{1,}/g, " ");
        if (aval instanceof infer.AVal) aval.doc = first;
        if (type) type.doc = first;
    }

    // Parses a subset of JSDoc-style comments in order to include the
    // explicitly defined types in the analysis.

    function skipSpace(str, pos) {
        while (/\s/.test(str.charAt(pos)))++pos;
        return pos;
    }

    function parseLabelList(scope, str, pos, close) {
        var labels = [], types = [];
        for (var first = true; ; first = false) {
            pos = skipSpace(str, pos);
            if (first && str.charAt(pos) == close) break;
            var colon = str.indexOf(":", pos);
            if (colon < 0) return null;
            var label = str.slice(pos, colon);
            if (!/^[\w$]+$/.test(label)) return null;
            labels.push(label);
            pos = colon + 1;
            var type = parseType(scope, str, pos);
            if (!type) return null;
            pos = type.end;
            types.push(type.type);
            pos = skipSpace(str, pos);
            var next = str.charAt(pos);
            ++pos;
            if (next == close) break;
            if (next != ",") return null;
        }
        return { labels: labels, types: types, end: pos };
    }

    function parseType(scope, str, pos) {
        pos = skipSpace(str, pos);
        var type;

        if (str.indexOf("function(", pos) == pos) {
            var args = parseLabelList(scope, str, pos + 9, ")"), ret = infer.ANull;
            if (!args) return null;
            pos = skipSpace(str, args.end);
            if (str.charAt(pos) == ":") {
                ++pos;
                var retType = parseType(scope, str, pos + 1);
                if (!retType) return null;
                pos = retType.end;
                ret = retType.type;
            }
            type = new infer.Fn(null, infer.ANull, args.types, args.labels, ret);
        } else if (str.charAt(pos) == "[") {
            var inner = parseType(scope, str, pos + 1);
            if (!inner) return null;
            pos = skipSpace(str, inner.end);
            if (str.charAt(pos) != "]") return null;
            ++pos;
            type = new infer.Arr(inner.type);
        } else if (str.charAt(pos) == "{") {
            var fields = parseLabelList(scope, str, pos + 1, "}");
            if (!fields) return null;
            type = new infer.Obj(true);
            for (var i = 0; i < fields.types.length; ++i) {
                var field = type.defProp(fields.labels[i]);
                field.initializer = true;
                fields.types[i].propagate(field);
            }
            pos = fields.end;
        } else {
            var start = pos;
            while (/[\w$]/.test(str.charAt(pos)))++pos;
            if (start == pos) return null;
            var word = str.slice(start, pos);
            if (/^(number|integer)$/i.test(word)) type = infer.cx().num;
            else if (/^bool(ean)?$/i.test(word)) type = infer.cx().bool;
            else if (/^string$/i.test(word)) type = infer.cx().str;
            else if (/^array$/i.test(word)) {
                var inner = null;
                if (str.charAt(pos) == "." && str.charAt(pos + 1) == "<") {
                    var inAngles = parseType(scope, str, pos + 2);
                    if (!inAngles) return null;
                    pos = skipSpace(str, inAngles.end);
                    if (str.charAt(pos++) != ">") return null;
                    inner = inAngles.type;
                }
                type = new infer.Arr(inner);
            } else if (/^object$/i.test(word)) {
                type = new infer.Obj(true);
                if (str.charAt(pos) == "." && str.charAt(pos + 1) == "<") {
                    var key = parseType(scope, str, pos + 2);
                    if (!key) return null;
                    pos = skipSpace(str, key.end);
                    if (str.charAt(pos++) != ",") return null;
                    var val = parseType(scope, str, pos);
                    if (!val) return null;
                    pos = skipSpace(str, val.end);
                    if (str.charAt(pos++) != ">") return null;
                    val.type.propagate(type.defProp("<i>"));
                }
            } else {
                var found = scope.hasProp(word);
                if (found) found = found.getType();
                if (!found) {
                    type = infer.ANull;
                } else if (found instanceof infer.Fn && /^[A-Z]/.test(word)) {
                    var proto = found.getProp("prototype").getType();
                    if (proto instanceof infer.Obj) type = infer.getInstance(proto);
                    else type = found;
                } else {
                    type = found;
                }
            }
        }

        var isOptional = false;
        if (str.charAt(pos) == "=") {
            ++pos;
            isOptional = true;
        }
        return { type: type, end: pos, isOptional: isOptional };
    }

    function parseTypeOuter(scope, str, pos) {
        pos = skipSpace(str, pos || 0);
        if (str.charAt(pos) != "{") return null;
        var result = parseType(scope, str, pos + 1);
        if (!result || str.charAt(result.end) != "}") return null;
        ++result.end;
        return result;
    }

    function jsdocInterpretComments(node, scope, aval, comments) {
        var type, args, ret, foundOne;

        for (var i = 0; i < comments.length; ++i) {
            var comment = comments[i];
            var decl = /(?:\n|$|\*)\s*@(type|param|arg(?:ument)?|returns?)\s+(.*)/g, m;
            while (m = decl.exec(comment)) {
                var parsed = parseTypeOuter(scope, m[2]);
                if (!parsed) continue;
                foundOne = true;

                switch (m[1]) {
                    case "returns": case "return":
                        ret = parsed.type; break;
                    case "type":
                        type = parsed.type; break;
                    case "param": case "arg": case "argument":
                        var name = m[2].slice(parsed.end).match(/^\s*([\w$]+)/);
                        if (!name) continue;
                        var argname = name[1] + (parsed.isOptional ? "?" : "");
                        (args || (args = Object.create(null)))[argname] = parsed.type;
                        break;
                }
            }
        }

        if (foundOne) applyType(type, args, ret, node, aval);
    };

    function applyType(type, args, ret, node, aval) {
        var fn;
        if (node.type == "VariableDeclaration") {
            var decl = node.declarations[0];
            if (decl.init && decl.init.type == "FunctionExpression") fn = decl.init.body.scope.fnType;
        } else if (node.type == "FunctionDeclaration") {
            fn = node.body.scope.fnType;
        } else if (node.type == "AssignmentExpression") {
            if (node.right.type == "FunctionExpression")
                fn = node.right.body.scope.fnType;
        } else { // An object property
            if (node.value.type == "FunctionExpression") fn = node.value.body.scope.fnType;
        }

        if (fn && (args || ret)) {
            if (args) for (var i = 0; i < fn.argNames.length; ++i) {
                var name = fn.argNames[i], known = args[name];
                if (!known && (known = args[name + "?"]))
                    fn.argNames[i] += "?";
                if (known) known.propagate(fn.args[i]);
            }
            if (ret) ret.propagate(fn.retval);
        } else if (type) {
            type.propagate(aval);
        }
    };
});

//#endregion


//#region tern/plugin/angular.js

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        return mod(require("../lib/infer"), require("../lib/tern"), require("../lib/comment"),
                   require("acorn/util/walk"), require("acorn/acorn"));
    if (typeof define == "function" && define.amd) // AMD
        return define(["../lib/infer", "../lib/tern", "../lib/comment", "acorn/util/walk", "acorn/acorn"], mod);
    mod(tern, tern, tern.comment, acorn.walk, acorn);
})(function (infer, tern, comment, walk, acorn) {
    "use strict";

    var SetDoc = infer.constraint("doc", {
        addType: function (type) {
            if (!type.doc) type.doc = this.doc;
        }
    });

    function Injector() {
        this.fields = Object.create(null);
        this.forward = [];
    }

    Injector.prototype.get = function (name) {
        if (name == "$scope") return new infer.Obj(globalInclude("$rootScope").getType(), "$scope");
        if (name in this.fields) return this.fields[name];
        var field = this.fields[name] = new infer.AVal;
        return field;
    };
    Injector.prototype.set = function (name, val, doc, node, depth, fieldType) {
        if (name == "$scope" || depth && depth > 10) return;
        var field = this.fields[name] || (this.fields[name] = new infer.AVal);
        if (!depth) field.local = true;
        field.type = fieldType;
        field.fnType = val.fnType;
        if (!field.origin) field.origin = infer.cx().curOrigin;
        if (typeof node == "string" && !field.span) field.span = node;
        else if (node && typeof node == "object" && !field.originNode) field.originNode = node;
        if (doc) { field.doc = doc; field.propagate(new SetDoc(doc)); }
        val.propagate(field);
        for (var i = 0; i < this.forward.length; ++i)
            this.forward[i].set(name, val, doc, node, (depth || 0) + 1);
    };
    Injector.prototype.forwardTo = function (injector) {
        this.forward.push(injector);
        for (var field in this.fields) {
            var val = this.fields[field];
            injector.set(field, val, val.doc, val.span || val.originNode, 1);
        }
    };

    function globalInclude(name) {
        var service = infer.cx().definitions.angular.service;
        if (service.hasProp(name)) return service.getProp(name);
    }

    function getInclude(mod, name) {
        var glob = globalInclude(name);
        if (glob) return glob;
        if (!mod.injector) return infer.ANull;
        return mod.injector ? mod.injector.get(name) : infer.ANull;
    }

    function applyWithInjection(mod, fnType, node, asNew) {
        var deps = [];
        if (node.type == "FunctionExpression") {
            for (var i = 0; i < node.params.length; ++i)
                deps.push(getInclude(mod, node.params[i].name));
        } else if (node.type == "ArrayExpression") {
            for (var i = 0; i < node.elements.length - 1; ++i) {
                var elt = node.elements[i];
                if (elt.type == "Literal" && typeof elt.value == "string")
                    deps.push(getInclude(mod, elt.value));
                else
                    deps.push(infer.ANull);
            }
            var last = node.elements[node.elements.length - 1];
            if (last && last.type == "FunctionExpression")
                fnType = last.body.scope.fnType;
        }
        var result = new infer.AVal;
        if (asNew) {
            var self = new infer.AVal;
            fnType.propagate(new infer.IsCtor(self));
            self.propagate(result, 90);
            fnType.propagate(new infer.IsCallee(self, deps, null, new infer.IfObj(result)));
        } else {
            fnType.propagate(new infer.IsCallee(infer.cx().topScope, deps, null, result));
        }
        result.fnType = fnType;
        return result;
    }

    infer.registerFunction("angular_callInject", function (argN) {
        return function (self, args, argNodes) {
            var mod = self.getType();
            if (mod && argNodes && argNodes[argN])
                applyWithInjection(mod, args[argN], argNodes[argN]);
            if (args[argN].argNames && args[argN].argNames[0] == '$rootScope') {
                mod.rootScope = args[argN].args[0];
            }
        };
    });

    infer.registerFunction("angular_regFieldCallController", function (self, args, argNodes) {
        angular_regFieldCall(self, args, argNodes, 'controller')
    });

    infer.registerFunction("angular_regFieldCallDirective", function (self, args, argNodes) {
        var mod = self.getType(), fn = null;
        if (mod && argNodes && argNodes.length > 1) {
            var retval = args[1].retval;
            if (retval) {
                var type = retval.getType();
                if (type && type.props && type.props.controller && type.props.controller.getType()) {
                    var fn = args[1].retval.getType().props.controller.getType();
                    var node = fn.originNode;

                    var result = applyWithInjection(mod, fn, node);
                    if (mod.injector && argNodes[0].type == "Literal")
                        mod.injector.set(argNodes[0].value + '#controller', result, argNodes[0].angularDoc, argNodes[0], null, 'controller');

                    fn = args[1].retval.getType();
                } else if (type && type.props && type.props.link && type.props.link.getType()) {
                    var fn = args[1].retval.getType().props.link.getType();
                    var node = fn.originNode;

                    var result = applyWithInjection(mod, fn, node);
                    if (mod.injector && argNodes[0].type == "Literal")
                        mod.injector.set(argNodes[0].value + '#link', result, argNodes[0].angularDoc, argNodes[0], null, 'controller');

                    fn = args[1].retval.getType();
                }
            }

            if (!mod.directives) mod.directives = {};
            mod.directives[argNodes[0].value] = { "originNode": argNodes[0], "type": fn };
        }
    });

    infer.registerFunction("angular_regFieldCall", function (self, args, argNodes) {
        angular_regFieldCall(self, args, argNodes);
    });

    function angular_regFieldCall(self, args, argNodes, callType) {
        var mod = self.getType();
        if (mod && argNodes && argNodes.length > 1) {
            var result = applyWithInjection(mod, args[1], argNodes[1]);
            if (mod.injector && argNodes[0].type == "Literal")
                mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0], null, callType);
        }
    };

    infer.registerFunction("angular_regFieldNew", function (self, args, argNodes) {
        var mod = self.getType();
        if (mod && argNodes && argNodes.length > 1) {
            var result = applyWithInjection(mod, args[1], argNodes[1], true);
            if (mod.injector && argNodes[0].type == "Literal")
                mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0]);
        }
    });

    infer.registerFunction("angular_regField", function (self, args, argNodes) {
        var mod = self.getType();
        if (mod && mod.injector && argNodes && argNodes[0] && argNodes[0].type == "Literal" && args[1])
            mod.injector.set(argNodes[0].value, args[1], argNodes[0].angularDoc, argNodes[0]);
    });

    infer.registerFunction("angular_callFilter", function (self, args, argNodes) {
        var mod = self.getType();
        if (mod && argNodes && argNodes[0] && argNodes[0].type == "Literal") {
            if (!mod.filters) mod.filters = {};
            mod.filters[argNodes[0].value] = { "originNode": argNodes[0], "fnType": argNodes[1] };
        }
    });

    infer.registerFunction("angular_callFactory", function (self, args, argNodes) {
        var mod = self.getType();
        if (mod && argNodes && argNodes.length > 1) {
            var result = applyWithInjection(mod, args[1], argNodes[1]);
            if (mod.injector && argNodes[0].type == "Literal") {
                mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0], null);
                if (!mod.factories) mod.factories = {};
                mod.factories[argNodes[0].value] = { "originNode": argNodes[0] };
            }
        }
    });

    infer.registerFunction("angular_callProvider", function (self, args, argNodes) {
        var mod = self.getType();
        if (mod && argNodes && argNodes.length > 1) {
            var result = applyWithInjection(mod, args[1], argNodes[1]);
            if (mod.injector && argNodes[0].type == "Literal") {
                mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0], null);
                if (!mod.providers) mod.providers = {};
                mod.providers[argNodes[0].value] = { "originNode": argNodes[0] };
            }
        }
    });

    infer.registerFunction("angular_callService", function (self, args, argNodes) {
        var mod = self.getType();
        if (mod && argNodes && argNodes.length > 1) {
            var result = applyWithInjection(mod, args[1], argNodes[1], true);
            if (mod.injector && argNodes[0].type == "Literal")
                mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0]);
            if (!mod.services) mod.services = {};
            mod.services[argNodes[0].value] = { "originNode": argNodes[0] };
        }
    });

    function arrayNodeToStrings(node) {
        var strings = [];
        if (node && node.type == "ArrayExpression")
            for (var i = 0; i < node.elements.length; ++i) {
                var elt = node.elements[i];
                if (elt.type == "Literal" && typeof elt.value == "string")
                    strings.push(elt.value);
            }
        return strings;
    }

    function moduleProto(cx) {
        var ngDefs = cx.definitions.angular;
        return ngDefs && ngDefs.Module.getProp("prototype").getType();
    }

    function declareMod(name, includes, originNode) {
        var cx = infer.cx(), data = cx.parent._angular;
        var proto = moduleProto(cx);
        var mod = new infer.Obj(proto || true);
        if (!proto) data.nakedModules.push(mod);
        mod.origin = cx.curOrigin;
        mod.originNode = originNode;
        mod.injector = new Injector();
        mod.metaData = { includes: includes };
        for (var i = 0; i < includes.length; ++i) {
            var depMod = data.modules[includes[i]];
            if (!depMod)
                (data.pendingImports[includes[i]] || (data.pendingImports[includes[i]] = [])).push(mod.injector);
            else if (depMod.injector)
                depMod.injector.forwardTo(mod.injector);
        }
        if (typeof name == "string") {
            data.modules[name] = mod;
            var pending = data.pendingImports[name];
            if (pending) {
                delete data.pendingImports[name];
                for (var i = 0; i < pending.length; ++i)
                    mod.injector.forwardTo(pending[i]);
            }
        }
        return mod;
    }

    infer.registerFunction("angular_module", function (_self, _args, argNodes) {
        var mod, name = argNodes && argNodes[0] && argNodes[0].type == "Literal" && argNodes[0].value;
        if (typeof name == "string")
            mod = infer.cx().parent._angular.modules[name];
        if (!mod)
            mod = declareMod(name, arrayNodeToStrings(argNodes && argNodes[1]), argNodes[0]);
        return mod;
    });

    var IsBound = infer.constraint("self, args, target", {
        addType: function (tp) {
            if (!(tp instanceof infer.Fn)) return;
            this.target.addType(new infer.Fn(tp.name, tp.self, tp.args.slice(this.args.length),
                                             tp.argNames.slice(this.args.length), tp.retval));
            this.self.propagate(tp.self);
            for (var i = 0; i < Math.min(tp.args.length, this.args.length) ; ++i)
                this.args[i].propagate(tp.args[i]);
        }
    });

    infer.registerFunction("angular_bind", function (_self, args) {
        if (args.length < 2) return infer.ANull;
        var result = new infer.AVal;
        args[1].propagate(new IsBound(args[0], args.slice(2), result));
        return result;
    });

    function postParse(ast, text) {
        walk.simple(ast, {
            CallExpression: function (node) {
                if (node.callee.type == "MemberExpression" &&
                    !node.callee.computed && node.arguments.length &&
                    /^(value|constant|controller|factory|provider)$/.test(node.callee.property.name)) {
                    var before = comment.commentsBefore(text, node.callee.property.start - 1);
                    if (before) {
                        var first = before[0], dot = first.search(/\.\s/);
                        if (dot > 5) first = first.slice(0, dot + 1);
                        first = first.trim().replace(/\s*\n\s*\*\s*|\s{1,}/g, " ");
                        node.arguments[0].angularDoc = first;
                    }
                }
            }
        });
    }

    function postLoadDef(json) {
        var cx = infer.cx(), defName = json["!name"], defs = cx.definitions[defName];
        if (defName == "angular") {
            var proto = moduleProto(cx), naked = cx.parent._angular.nakedModules;
            if (proto) for (var i = 0; i < naked.length; ++i) naked[i].proto = proto;
            return;
        }
        var mods = defs && defs["!ng"];
        if (mods) for (var name in mods.props) {
            var obj = mods.props[name].getType();
            var mod = declareMod(name.replace(/`/g, "."), obj.metaData && obj.metaData.includes || []);
            mod.origin = defName;
            for (var prop in obj.props) {
                var val = obj.props[prop], tp = val.getType();
                if (!tp) continue;
                if (/^_inject_/.test(prop)) {
                    if (!tp.name) tp.name = prop.slice(8);
                    mod.injector.set(prop.slice(8), tp, val.doc, val.span);
                } else {
                    obj.props[prop].propagate(mod.defProp(prop));
                }
            }
        }
    }

    function preCondenseReach(state) {
        var mods = infer.cx().parent._angular.modules;
        var modObj = new infer.Obj(null), found = 0;
        for (var name in mods) {
            var mod = mods[name];
            if (state.origins.indexOf(mod.origin) > -1) {
                var propName = name.replace(/\./g, "`");
                modObj.defProp(propName).addType(mod);
                mod.condenseForceInclude = true;
                ++found;
                if (mod.injector) for (var inj in mod.injector.fields) {
                    var field = mod.injector.fields[inj];
                    if (field.local) state.roots["!ng." + propName + "._inject_" + inj] = field;
                }
            }
        }
        if (found) state.roots["!ng"] = modObj;
    }

    function postCondenseReach(state) {
        var mods = infer.cx().parent._angular.modules;
        for (var path in state.types) {
            var m;
            if (m = path.match(/^!ng\.([^\.]+)\._inject_([^\.]+)^/)) {
                var mod = mods[m[1].replace(/`/g, ".")];
                console.log(mod.injector.fields, m[2]);
                var field = mod.injector.fields[m[2]];
                var data = state.types[path];
                if (field.span) data.span = field.span;
                if (field.doc) data.doc = field.doc;
            }
        }
    }

    function initServer(server) {
        server._angular = {
            modules: Object.create(null),
            pendingImports: Object.create(null),
            nakedModules: []
        };
    }

    tern.registerPlugin("angular", function (server) {
        initServer(server);
        server.on("reset", function () { initServer(server); });
        return {
            defs: defs,
            passes: {
                postParse: postParse,
                postLoadDef: postLoadDef,
                preCondenseReach: preCondenseReach,
                postCondenseReach: postCondenseReach
            },
            loadFirst: true
        };
    });

    var defs = {
        "!name": "angular",
        "!define": {
            cacheObj: {
                info: "fn() -> ?",
                put: "fn(key: string, value: ?) -> !1",
                get: "fn(key: string) -> ?",
                remove: "fn(key: string)",
                removeAll: "fn()",
                destroy: "fn()"
            },
            eventObj: {
                targetScope: "service.$rootScope",
                currentScope: "service.$rootScope",
                name: "string",
                stopPropagation: "fn()",
                preventDefault: "fn()",
                defaultPrevented: "bool"
            },
            Module: {
                "!url": "http://docs.angularjs.org/api/angular.Module",
                "!doc": "Interface for configuring angular modules.",
                prototype: {
                    animation: {
                        "!type": "fn(name: string, animationFactory: fn()) -> !this",
                        "!url": "http://docs.angularjs.org/api/angular.Module#animation",
                        "!doc": "Defines an animation hook that can be later used with $animate service and directives that use this service."
                    },
                    config: {
                        "!type": "fn(configFn: fn()) -> !this",
                        "!effects": ["custom angular_callInject 0"],
                        "!url": "http://docs.angularjs.org/api/angular.Module#config",
                        "!doc": "Use this method to register work which needs to be performed on module loading."
                    },
                    constant: "service.$provide.constant",
                    controller: {
                        "!type": "fn(name: string, constructor: fn()) -> !this",
                        "!effects": ["custom angular_regFieldCallController"],
                        "!url": "http://docs.angularjs.org/api/ng.$controllerProvider",
                        "!doc": "Register a controller."
                    },
                    directive: {
                        "!type": "fn(name: string, directiveFactory: fn()) -> !this",
                        "!effects": ["custom angular_regFieldCallDirective"],
                        "!url": "http://docs.angularjs.org/api/ng.$compileProvider#directive",
                        "!doc": "Register a new directive with the compiler."
                    },
                    factory: "service.$provide.factory",
                    filter: {
                        "!type": "fn(name: string, filterFactory: fn()) -> !this",
                        "!effects": ["custom angular_callFilter"],
                        "!url": "http://docs.angularjs.org/api/ng.$filterProvider",
                        "!doc": "Register filter factory function."
                    },
                    provider: "service.$provide.provider",
                    run: {
                        "!type": "fn(initializationFn: fn()) -> !this",
                        "!effects": ["custom angular_callInject 0"],
                        "!url": "http://docs.angularjs.org/api/angular.Module#run",
                        "!doc": "Register work which should be performed when the injector is done loading all modules."
                    },
                    service: "service.$provide.service",
                    value: "service.$provide.value",
                    name: {
                        "!type": "string",
                        "!url": "http://docs.angularjs.org/api/angular.Module#name",
                        "!doc": "Name of the module."
                    },
                    requires: {
                        "!type": "[string]",
                        "!url": "http://docs.angularjs.org/api/angular.Module#requires",
                        "!doc": "List of module names which must be loaded before this module."
                    }
                }
            },
            Promise: {
                "!url": "http://docs.angularjs.org/api/ng.$q",
                "!doc": "Allow for interested parties to get access to the result of the deferred task when it completes.",
                prototype: {
                    then: "fn(successCallback: fn(value: ?), errorCallback: fn(reason: ?), notifyCallback: fn(value: ?)) -> +Promise",
                    "catch": "fn(errorCallback: fn(reason: ?))",
                    "finally": "fn(callback: fn()) -> +Promise",
                    success: "fn(callback: fn(data: ?, status: number, headers: ?, config: ?)) -> +Promise",
                    error: "fn(callback: fn(data: ?, status: number, headers: ?, config: ?)) -> +Promise"
                }
            },
            Deferred: {
                "!url": "http://docs.angularjs.org/api/ng.$q",
                prototype: {
                    resolve: "fn(value: ?)",
                    reject: "fn(reason: ?)",
                    notify: "fn(value: ?)",
                    promise: "+Promise"
                }
            },
            ResourceClass: {
                "!url": "http://docs.angularjs.org/api/ngResource.$resource",
                prototype: {
                    $promise: "+Promise",
                    $save: "fn()"
                }
            },
            Resource: {
                "!url": "http://docs.angularjs.org/api/ngResource.$resource",
                prototype: {
                    get: "fn(params: ?, callback: fn()) -> +ResourceClass",
                    save: "fn(params: ?, callback: fn()) -> +ResourceClass",
                    query: "fn(params: ?, callback: fn()) -> +ResourceClass",
                    remove: "fn(params: ?, callback: fn()) -> +ResourceClass",
                    "delete": "fn(params: ?, callback: fn()) -> +ResourceClass"
                }
            },
            service: {
                $anchorScroll: {
                    "!type": "fn()",
                    "!url": "http://docs.angularjs.org/api/ng.$anchorScroll",
                    "!doc": "Checks current value of $location.hash() and scroll to related element."
                },
                $animate: {
                    "!url": "http://docs.angularjs.org/api/ng.$animate",
                    "!doc": "Rudimentary DOM manipulation functions to insert, remove, move elements within the DOM.",
                    addClass: {
                        "!type": "fn(element: +Element, className: string, done?: fn()) -> !this",
                        "!url": "http://docs.angularjs.org/api/ng.$animate#addClass",
                        "!doc": "Adds the provided className CSS class value to the provided element."
                    },
                    enter: {
                        "!type": "fn(element: +Element, parent: +Element, after: +Element, done?: fn()) -> !this",
                        "!url": "http://docs.angularjs.org/api/ng.$animate#enter",
                        "!doc": "Inserts the element into the DOM either after the after element or within the parent element."
                    },
                    leave: {
                        "!type": "fn(element: +Element, done?: fn()) -> !this",
                        "!url": "http://docs.angularjs.org/api/ng.$animate#leave",
                        "!doc": "Removes the element from the DOM."
                    },
                    move: {
                        "!type": "fn(element: +Element, parent: +Element, after: +Element, done?: fn()) -> !this",
                        "!url": "http://docs.angularjs.org/api/ng.$animate#move",
                        "!doc": "Moves element to be placed either after the after element or inside of the parent element."
                    },
                    removeClass: {
                        "!type": "fn(element: +Element, className: string, done?: fn()) -> !this",
                        "!url": "http://docs.angularjs.org/api/ng.$animate#removeClass",
                        "!doc": "Removes the provided className CSS class value from the provided element."
                    }
                },
                $cacheFactory: {
                    "!type": "fn(cacheId: string, options?: ?) -> cacheObj",
                    "!url": "http://docs.angularjs.org/api/ng.$cacheFactory",
                    "!doc": "Factory that constructs cache objects and gives access to them."
                },
                $compile: {
                    "!type": "fn(element: +Element, transclude: fn(scope: ?), maxPriority: number)",
                    "!url": "http://docs.angularjs.org/api/ng.$compile",
                    "!doc": "Compiles a piece of HTML string or DOM into a template and produces a template function."
                },
                $controller: {
                    "!type": "fn(controller: fn(), locals: ?) -> ?",
                    "!url": "http://docs.angularjs.org/api/ng.$controller",
                    "!doc": "Instantiates controllers."
                },
                $document: {
                    "!type": "jQuery.fn",
                    "!url": "http://docs.angularjs.org/api/ng.$document",
                    "!doc": "A jQuery (lite)-wrapped reference to the browser's window.document element."
                },
                $exceptionHandler: {
                    "!type": "fn(exception: +Error, cause?: string)",
                    "!url": "http://docs.angularjs.org/api/ng.$exceptionHandler",
                    "!doc": "Any uncaught exception in angular expressions is delegated to this service."
                },
                $filter: {
                    "!type": "fn(name: string) -> fn(input: string) -> string",
                    "!url": "http://docs.angularjs.org/api/ng.$filter",
                    "!doc": "Retrieve a filter function."
                },
                $http: {
                    "!type": "fn(config: ?) -> service.$q",
                    "!url": "http://docs.angularjs.org/api/ng.$http",
                    "!doc": "Facilitates communication with remote HTTP servers.",
                    "delete": "fn(url: string, config?: ?) -> +Promise",
                    get: "fn(url: string, config?: ?) -> +Promise",
                    head: "fn(url: string, config?: ?) -> +Promise",
                    jsonp: "fn(url: string, config?: ?) -> +Promise",
                    post: "fn(url: string, data: ?, config?: ?) -> +Promise",
                    put: "fn(url: string, data: ?, config?: ?) -> +Promise"
                },
                $interpolate: {
                    "!type": "fn(text: string, mustHaveExpression?: bool, trustedContext?: string) -> fn(context: ?) -> string",
                    "!url": "http://docs.angularjs.org/api/ng.$interpolate",
                    "!doc": "Compiles a string with markup into an interpolation function."
                },
                $locale: {
                    "!url": "http://docs.angularjs.org/api/ng.$locale",
                    id: "string"
                },
                $location: {
                    "!url": "http://docs.angularjs.org/api/ng.$location",
                    "!doc": "Parses the URL in the browser address bar.",
                    absUrl: {
                        "!type": "fn() -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#absUrl",
                        "!doc": "Return full url representation."
                    },
                    hash: {
                        "!type": "fn(value?: string) -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#hash",
                        "!doc": "Get or set the hash fragment."
                    },
                    host: {
                        "!type": "fn() -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#host",
                        "!doc": "Return host of current url."
                    },
                    path: {
                        "!type": "fn(value?: string) -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#path",
                        "!doc": "Get or set the URL path."
                    },
                    port: {
                        "!type": "fn() -> number",
                        "!url": "http://docs.angularjs.org/api/ng.$location#port",
                        "!doc": "Returns the port of the current url."
                    },
                    protocol: {
                        "!type": "fn() -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#protocol",
                        "!doc": "Return protocol of current url."
                    },
                    replace: {
                        "!type": "fn()",
                        "!url": "http://docs.angularjs.org/api/ng.$location#replace",
                        "!doc": "Changes to $location during current $digest will be replacing current history record, instead of adding new one."
                    },
                    search: {
                        "!type": "fn(search: string, paramValue?: string) -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#search",
                        "!doc": "Get or set the URL query."
                    },
                    url: {
                        "!type": "fn(url: string, replace?: string) -> string",
                        "!url": "http://docs.angularjs.org/api/ng.$location#url",
                        "!doc": "Get or set the current url."
                    }
                },
                $log: {
                    "!url": "http://docs.angularjs.org/api/ng.$log",
                    "!doc": "Simple service for logging.",
                    debug: {
                        "!type": "fn(message: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$log#debug",
                        "!doc": "Write a debug message."
                    },
                    error: {
                        "!type": "fn(message: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$log#error",
                        "!doc": "Write an error message."
                    },
                    info: {
                        "!type": "fn(message: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$log#info",
                        "!doc": "Write an info message."
                    },
                    log: {
                        "!type": "fn(message: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$log#log",
                        "!doc": "Write a log message."
                    },
                    warn: {
                        "!type": "fn(message: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$log#warn",
                        "!doc": "Write a warning message."
                    }
                },
                $parse: {
                    "!type": "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
                    "!url": "http://docs.angularjs.org/api/ng.$parse",
                    "!doc": "Converts Angular expression into a function."
                },
                $q: {
                    "!url": "http://docs.angularjs.org/api/ng.$q",
                    "!doc": "A promise/deferred implementation.",
                    all: {
                        "!type": "fn(promises: [+Promise]) -> +Promise",
                        "!url": "http://docs.angularjs.org/api/ng.$q#all",
                        "!doc": "Combines multiple promises into a single promise."
                    },
                    defer: {
                        "!type": "fn() -> +Deferred",
                        "!url": "http://docs.angularjs.org/api/ng.$q#defer",
                        "!doc": "Creates a Deferred object which represents a task which will finish in the future."
                    },
                    reject: {
                        "!type": "fn(reasion: ?) -> +Promise",
                        "!url": "http://docs.angularjs.org/api/ng.$q#reject",
                        "!doc": "Creates a promise that is resolved as rejected with the specified reason."
                    },
                    when: {
                        "!type": "fn(value: ?) -> +Promise",
                        "!url": "http://docs.angularjs.org/api/ng.$q#when",
                        "!doc": "Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise."
                    }
                },
                $rootElement: {
                    "!type": "+Element",
                    "!url": "http://docs.angularjs.org/api/ng.$rootElement",
                    "!doc": "The root element of Angular application."
                },
                $rootScope: {
                    "!url": "http://docs.angularjs.org/api/ng.$rootScope",
                    $apply: {
                        "!type": "fn(expression: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$apply",
                        "!doc": "Execute an expression in angular from outside of the angular framework."
                    },
                    $broadcast: {
                        "!type": "fn(name: string, args?: ?) -> eventObj",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$broadcast",
                        "!doc": "Dispatches an event name downwards to all child scopes."
                    },
                    $destroy: {
                        "!type": "fn()",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$destroy",
                        "!doc": "Removes the current scope (and all of its children) from the parent scope."
                    },
                    $digest: {
                        "!type": "fn()",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$digest",
                        "!doc": "Processes all of the watchers of the current scope and its children."
                    },
                    $emit: {
                        "!type": "fn(name: string, args?: ?) -> eventObj",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$emit",
                        "!doc": "Dispatches an event name upwards through the scope hierarchy."
                    },
                    $eval: {
                        "!type": "fn(expression: string) -> ?",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$eval",
                        "!doc": "Executes the expression on the current scope and returns the result."
                    },
                    $evalAsync: {
                        "!type": "fn(expression: string)",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$evalAsync",
                        "!doc": "Executes the expression on the current scope at a later point in time."
                    },
                    $new: {
                        "!type": "fn(isolate: bool) -> service.$rootScope",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$new",
                        "!doc": "Creates a new child scope."
                    },
                    $on: {
                        "!type": "fn(name: string, listener: fn(event: ?)) -> fn()",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$on",
                        "!doc": "Listens on events of a given type."
                    },
                    $watch: {
                        "!type": "fn(watchExpression: string, listener?: fn(), objectEquality?: bool) -> fn()",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$watch",
                        "!doc": "Registers a listener callback to be executed whenever the watchExpression changes."
                    },
                    $watchCollection: {
                        "!type": "fn(obj: string, listener: fn()) -> fn()",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$watchCollection",
                        "!doc": "Shallow watches the properties of an object and fires whenever any of the properties."
                    },
                    $id: {
                        "!type": "number",
                        "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$id",
                        "!doc": "Unique scope ID."
                    }
                },
                $sce: {
                    HTML: "string",
                    CSS: "string",
                    URL: "string",
                    RESOURCE_URL: "string",
                    JS: "string",
                    getTrusted: "fn(type: string, maybeTrusted: ?) -> !1",
                    getTrustedCss: "fn(maybeTrusted: ?) -> !0",
                    getTrustedHtml: "fn(maybeTrusted: ?) -> !0",
                    getTrustedJs: "fn(maybeTrusted: ?) -> !0",
                    getTrustedResourceUrl: "fn(maybeTrusted: ?) -> !0",
                    getTrustedUrl: "fn(maybeTrusted: ?) -> !0",
                    parse: "fn(type: string, expression: string) -> fn(context: ?, locals: ?) -> ?",
                    parseAsCss: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
                    parseAsHtml: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
                    parseAsJs: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
                    parseAsResourceUrl: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
                    parseAsUrl: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
                    trustAs: "fn(type: string, value: ?) -> !1",
                    trustAsHtml: "fn(value: ?) -> !0",
                    trustAsJs: "fn(value: ?) -> !0",
                    trustAsResourceUrl: "fn(value: ?) -> !0",
                    trustAsUrl: "fn(value: ?) -> !0",
                    isEnabled: "fn() -> bool"
                },
                $templateCache: {
                    "!url": "http://docs.angularjs.org/api/ng.$templateCache",
                    "!proto": "cacheObj"
                },
                $timeout: {
                    "!type": "fn(fn: fn(), delay?: number, invokeApply?: bool) -> +Promise",
                    "!url": "http://docs.angularjs.org/api/ng.$timeout",
                    "!doc": "Angular's wrapper for window.setTimeout.",
                    cancel: "fn(promise: +Promise)"
                },
                $window: "<top>",
                $injector: {
                    "!url": "http://docs.angularjs.org/api/AUTO.$injector",
                    "!doc": "Retrieve object instances as defined by provider.",
                    annotate: {
                        "!type": "fn(f: fn()) -> [string]",
                        "!url": "http://docs.angularjs.org/api/AUTO.$injector#annotate",
                        "!doc": "Returns an array of service names which the function is requesting for injection."
                    },
                    get: {
                        "!type": "fn(name: string) -> ?",
                        "!url": "http://docs.angularjs.org/api/AUTO.$injector#get",
                        "!doc": "Return an instance of a service."
                    },
                    has: {
                        "!type": "fn(name: string) -> bool",
                        "!url": "http://docs.angularjs.org/api/AUTO.$injector#has",
                        "!doc": "Allows the user to query if the particular service exist."
                    },
                    instantiate: {
                        "!type": "fn(type: fn(), locals?: ?) -> +!0",
                        "!url": "http://docs.angularjs.org/api/AUTO.$injector#instantiate",
                        "!doc": "Create a new instance of JS type."
                    },
                    invoke: {
                        "!type": "fn(type: fn(), self?: ?, locals?: ?) -> !0.!ret",
                        "!url": "http://docs.angularjs.org/api/AUTO.$injector#invoke",
                        "!doc": "Invoke the method and supply the method arguments from the $injector."
                    }
                },
                $provide: {
                    "!url": "http://docs.angularjs.org/api/AUTO.$provide",
                    "!doc": "Use $provide to register new providers with the $injector.",
                    constant: {
                        "!type": "fn(name: string, value: ?) -> !this",
                        "!effects": ["custom angular_regField"],
                        "!url": "http://docs.angularjs.org/api/AUTO.$provide#constant",
                        "!doc": "A constant value."
                    },
                    decorator: {
                        "!type": "fn(name: string, decorator: fn())",
                        "!effects": ["custom angular_regFieldCall"],
                        "!url": "http://docs.angularjs.org/api/AUTO.$provide#decorator",
                        "!doc": "Decoration of service, allows the decorator to intercept the service instance creation."
                    },
                    factory: {
                        "!type": "fn(name: string, providerFunction: fn()) -> !this",
                        "!effects": ["custom angular_callFactory"],
                        "!url": "http://docs.angularjs.org/api/AUTO.$provide#factory",
                        "!doc": "A short hand for configuring services if only $get method is required."
                    },
                    provider: {
                        "!type": "fn(name: string, providerType: fn()) -> !this",
                        "!effects": ["custom angular_callProvider"],
                        "!url": "http://docs.angularjs.org/api/AUTO.$provide#provider",
                        "!doc": "Register a provider for a service."
                    },
                    service: {
                        "!type": "fn(name: string, constructor: fn()) -> !this",
                        "!effects": ["custom angular_callService"],
                        "!url": "http://docs.angularjs.org/api/AUTO.$provide#provider",
                        "!doc": "Register a provider for a service."
                    },
                    value: {
                        "!type": "fn(name: string, object: ?) -> !this",
                        "!effects": ["custom angular_regField"],
                        "!url": "http://docs.angularjs.org/api/AUTO.$providevalue",
                        "!doc": "A short hand for configuring services if the $get method is a constant."
                    }
                },
                $cookies: {
                    "!url": "http://docs.angularjs.org/api/ngCookies.$cookies",
                    "!doc": "Provides read/write access to browser's cookies.",
                    text: "string"
                },
                $resource: {
                    "!type": "fn(url: string, paramDefaults?: ?, actions?: ?) -> +Resource",
                    "!url": "http://docs.angularjs.org/api/ngResource.$resource",
                    "!doc": "Creates a resource object that lets you interact with RESTful server-side data sources."
                },
                $route: {
                    "!url": "http://docs.angularjs.org/api/ngRoute.$route",
                    "!doc": "Deep-link URLs to controllers and views.",
                    reload: {
                        "!type": "fn()",
                        "!url": "http://docs.angularjs.org/api/ngRoute.$route#reload",
                        "!doc": "Reload the current route even if $location hasn't changed."
                    },
                    current: {
                        "!url": "http://docs.angularjs.org/api/ngRoute.$route#current",
                        "!doc": "Reference to the current route definition.",
                        controller: "?",
                        locals: "?"
                    },
                    routes: "[?]"
                },
                $sanitize: {
                    "!type": "fn(string) -> string",
                    "!url": "http://docs.angularjs.org/api/ngSanitize.$sanitize",
                    "!doc": "Sanitize HTML input."
                },
                $swipe: {
                    "!url": "http://docs.angularjs.org/api/ngTouch.$swipe",
                    "!doc": "A service that abstracts the messier details of hold-and-drag swipe behavior.",
                    bind: {
                        "!type": "fn(element: +Element, handlers: ?)",
                        "!url": "http://docs.angularjs.org/api/ngTouch.$swipe#bind",
                        "!doc": "Abstracts the messier details of hold-and-drag swipe behavior."
                    }
                }
            }
        },
        angular: {
            bind: {
                "!type": "fn(self: ?, fn: fn(), args?: ?) -> !custom:angular_bind",
                "!url": "http://docs.angularjs.org/api/angular.bind",
                "!doc": "Returns a function which calls function fn bound to self."
            },
            bootstrap: {
                "!type": "fn(element: +Element, modules?: [string]) -> service.$injector",
                "!url": "http://docs.angularjs.org/api/angular.bootstrap",
                "!doc": "Use this function to manually start up angular application."
            },
            copy: {
                "!type": "fn(source: ?, target?: ?) -> !0",
                "!url": "http://docs.angularjs.org/api/angular.copy",
                "!doc": "Creates a deep copy of source, which should be an object or an array."
            },
            element: {
                "!type": "fn(element: +Element) -> jQuery.fn",
                "!url": "http://docs.angularjs.org/api/angular.element",
                "!doc": "Wraps a raw DOM element or HTML string as a jQuery element."
            },
            equals: {
                "!type": "fn(o1: ?, o2: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.equals",
                "!doc": "Determines if two objects or two values are equivalent."
            },
            extend: {
                "!type": "fn(dst: ?, src: ?) -> !0",
                "!url": "http://docs.angularjs.org/api/angular.extend",
                "!doc": "Extends the destination object dst by copying all of the properties from the src object(s) to dst."
            },
            forEach: {
                "!type": "fn(obj: ?, iterator: fn(value: ?, key: ?), context?: ?) -> !0",
                "!effects": ["call !1 this=!2 !0.<i> number"],
                "!url": "http://docs.angularjs.org/api/angular.forEach",
                "!doc": "Invokes the iterator function once for each item in obj collection, which can be either an object or an array."
            },
            fromJson: {
                "!type": "fn(json: string) -> ?",
                "!url": "http://docs.angularjs.org/api/angular.fromJson",
                "!doc": "Deserializes a JSON string."
            },
            identity: {
                "!type": "fn(val: ?) -> !0",
                "!url": "http://docs.angularjs.org/api/angular.identity",
                "!doc": "A function that returns its first argument."
            },
            injector: {
                "!type": "fn(modules: [string]) -> service.$injector",
                "!url": "http://docs.angularjs.org/api/angular.injector",
                "!doc": "Creates an injector function"
            },
            isArray: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isArray",
                "!doc": "Determines if a reference is an Array."
            },
            isDate: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isDate",
                "!doc": "Determines if a reference is a date."
            },
            isDefined: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isDefined",
                "!doc": "Determines if a reference is defined."
            },
            isElement: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isElement",
                "!doc": "Determines if a reference is a DOM element."
            },
            isFunction: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isFunction",
                "!doc": "Determines if a reference is a function."
            },
            isNumber: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isNumber",
                "!doc": "Determines if a reference is a number."
            },
            isObject: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isObject",
                "!doc": "Determines if a reference is an object."
            },
            isString: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isString",
                "!doc": "Determines if a reference is a string."
            },
            isUndefined: {
                "!type": "fn(val: ?) -> bool",
                "!url": "http://docs.angularjs.org/api/angular.isUndefined",
                "!doc": "Determines if a reference is undefined."
            },
            lowercase: {
                "!type": "fn(val: string) -> string",
                "!url": "http://docs.angularjs.org/api/angular.lowercase",
                "!doc": "Converts the specified string to lowercase."
            },
            module: {
                "!type": "fn(name: string, deps: [string]) -> !custom:angular_module",
                "!url": "http://docs.angularjs.org/api/angular.module",
                "!doc": "A global place for creating, registering and retrieving Angular modules."
            },
            Module: "Module",
            noop: {
                "!type": "fn()",
                "!url": "http://docs.angularjs.org/api/angular.noop",
                "!doc": "A function that performs no operations."
            },
            toJson: {
                "!type": "fn(val: ?) -> string",
                "!url": "http://docs.angularjs.org/api/angular.toJson",
                "!doc": "Serializes input into a JSON-formatted string."
            },
            uppercase: {
                "!type": "fn(string) -> string",
                "!url": "http://docs.angularjs.org/api/angular.uppercase",
                "!doc": "Converts the specified string to uppercase."
            },
            version: {
                "!url": "http://docs.angularjs.org/api/angular.version",
                full: "string",
                major: "number",
                minor: "number",
                dot: "number",
                codename: "string"
            }
        }
    };

    // Angular query type.

    var querySubTypes = {
        completions: {
            run: findCompletions
        },
        definition: {
            run: findDef
        },
        type: {
            run: findType
        }
    }

    tern.defineQueryType("angular", {
        run: function (server, query) {
            var subtype = query.subtype;
            if (subtype == null) throw ternError("missing .query.subtype field");
            var angularTypes = query.angularTypes;
            if (angularTypes == null) throw ternError("missing .query.angularTypes field");
            var expression = query.expression;
            if (expression == null) throw ternError("missing .query.expression field");
            var scope = query.scope;
            var _angular = server.cx.parent._angular;
            if (_angular == null) throw ternError("missing server.cx.parent._angular");

            var files = [];
            var filesName = query.files;
            if (filesName) {
                for (var i = 0; i < filesName.length; i++) {
                    files.push(server.findFile(filesName[i]));
                }
            }

            return querySubTypes[subtype].run(_angular, files, expression, scope,
                angularTypes, query);
        }
    });

    // Utils

    function isBelongToFiles(origin, files) {
        for (var i = 0; i < files.length; i++) {
            if (files[i].name === origin) return true;
        }
        return false;
    }

    function startsWithString(str, token) {
        return str.slice(0, token.length).toUpperCase() == token.toUpperCase();
    }

    function getType(elt, name) {
        if (elt.props && elt.props[name]) {
            var obj = elt.props[name];
            var type = obj.getType(true);
            if (type) return type;
        }
        var forward = elt.forward;
        if (forward) {
            for (var i = 0; i < forward.length; i++) {
                var f = forward[i];
                var prop = f.prop;
                if (prop === name) {
                    var type = f.type;
                    if (type) return type;
                }
            }
        }
    }

    function getArrType(elt, name) {
        if (elt.props && elt.props[name]) {
            var obj = elt.props[name];
            var type = obj.getType(true);
            if (type && type.name == 'Array') {
                return type.getProp("<i>").getType();
            }
        }
        var forward = elt.forward;
        if (forward) {
            for (var i = 0; i < forward.length; i++) {
                var f = forward[i];
                var prop = f.prop;
                if (prop === name) {
                    var type = f.type;
                    if (type && type.name == 'Array') {
                        var itemType = type.getProp("<i>").getType();
                        if (itemType) return itemType;
                    }
                }
            }
        }
    }

    // Angular Modules query

    function getModule(_angular, files, moduleName) {
        var module = _angular.modules[moduleName];
        if (module && isBelongToFiles(module.origin, files)) return module;
    }

    function visitModules(_angular, files, c) {
        for (var moduleName in _angular.modules) {
            var module = _angular.modules[moduleName];
            if (isBelongToFiles(module.origin, files)) {
                if (c(moduleName, module))
                    break;
            }
        }
    }

    // Angular Controllers query  

    function getScopeArg(fnType) {
        if (fnType) {
            var argNames = fnType.argNames;
            if (argNames) {
                var args = fnType.args;
                var arg = null;
                for (var j = 0; j < argNames.length; j++) {
                    if (argNames[j] == "$scope") {
                        return args[j];
                    }
                }
            }
        }
    }

    function getScopeController(_angular, files, moduleName, controllerName) {
        if (moduleName) {
            var module = getModule(_angular, files, moduleName);
            if (module) {
                var fields = module.injector.fields, field = fields[controllerName];
                if (field && field.type === "controller") {
                    var fnType = field.fnType;
                    return getScopeArg(fnType);
                }
            }
        } else {
            var topScope = infer.cx().topScope, props = topScope.props;
            if (props) {
                var item = props[controllerName];
                if (item && isBelongToFiles(item.origin, files) && item.types && item.types.length > 0) {
                    for (var i = 0; i < item.types.length; i++) {
                        var fnType = item.types[i], scopeArg = getScopeArg(fnType);
                        if (scopeArg) return scopeArg;
                    }
                }
            }
        }
        return null;
    }

    function visitModuleControllers(_angular, files, moduleName, c) {
        var found = false;
        var module = getModule(_angular, files, moduleName);
        if (module) {
            var fields = module.injector.fields;
            for (var fieldName in fields) {
                var field = fields[fieldName];
                if (field.type === "controller") {
                    var fnType = field.fnType;
                    var scopeArg = getScopeArg(fnType);
                    if (scopeArg) {
                        found = true;
                        if (c(fieldName, field.originNode, fnType, scopeArg)) break;
                    }
                }
            }
        }
        return found;
    }

    function visitGlobalControllers(_angular, files, c) {
        var topScope = infer.cx().topScope, stop = false, props = topScope.props;
        if (props) {
            for (var prop in props) {
                if (prop != "<i>") {
                    if (stop)
                        break;
                    var item = props[prop];
                    if (item.types && item.types.length > 0) {
                        for (var i = 0; i < item.types.length; i++) {
                            if (stop)
                                break;
                            var fnType = item.types[i];
                            var scopeArg = getScopeArg(fnType);
                            if (scopeArg && isBelongToFiles(scopeArg.origin, files)) {
                                stop = (c(fnType.name, fnType.originNode.id, fnType,
                                    scopeArg));
                            }
                        }
                    }
                }
            }
        }
    }

    function visitControllers(_angular, files, moduleName, c) {
        var found = false;
        if (moduleName) {
            // find controllers of given module
            found = visitModuleControllers(_angular, files, moduleName, c);
        }
        if (!found) {
            // find global controllers of the given file
            visitGlobalControllers(_angular, files, c);
        }
    }

    // Angular directive query

    function visitDirectives(_angular, files, moduleName, c) {
        if (moduleName) {
            var module = getModule(_angular, files, moduleName);
            if (module) {
                var directives = module.directives;
                if (directives) {
                    for (var name in directives) {
                        var directive = directives[name];
                        if (c(name, directive.originNode, directive.type)) break;
                    }
                }
            }
        }
    }

    // Angular filter query

    function visitFilters(_angular, files, moduleName, c) {
        if (moduleName) {
            var module = getModule(_angular, files, moduleName);
            if (module) {
                var filters = module.filters;
                if (filters) {
                    for (var name in filters) {
                        var filter = filters[name];
                        if (c(name, filter.originNode, filter.type)) break;
                    }
                }
            }
        }
    }

    // Angular factory query

    function visitFactories(_angular, files, moduleName, c) {
        if (moduleName) {
            var module = getModule(_angular, files, moduleName);
            if (module) {
                var factories = module.factories;
                if (factories) {
                    for (var name in factories) {
                        var factory = factories[name];
                        if (c(name, factory.originNode, factory.type)) break;
                    }
                }
            }
        }
    }

    // Angular provider query

    function visitProviders(_angular, files, moduleName, c) {
        if (moduleName) {
            var module = getModule(_angular, files, moduleName);
            if (module) {
                var providers = module.providers;
                if (providers) {
                    for (var name in providers) {
                        var provider = providers[name];
                        if (c(name, provider.originNode, provider.type)) break;
                    }
                }
            }
        }
    }

    // Angular service query

    function visitServices(_angular, files, moduleName, c) {
        if (moduleName) {
            var module = getModule(_angular, files, moduleName);
            if (module) {
                var services = module.services;
                if (services) {
                    for (var name in services) {
                        var service = services[name];
                        if (c(name, service.originNode, service.type)) break;
                    }
                }
            }
        }
    }
    // Angular model query

    function findModels(scopeCtrl, c) {
        if (scopeCtrl) {
            var forward = scopeCtrl.forward;
            if (forward) {
                for (var i = 0; i < forward.length; i++) {
                    if (c(forward[i])) break;
                }
            }
        }
    }

    function maybeSet(obj, prop, val) {
        if (val != null) obj[prop] = val;
    }

    function findCompletions(_angular, files, expression, scope, angularTypes,
        query) {
        var completions = [];
        var result = {
            "completions": completions
        }

        var word = '', current = '', context = null;
        var length = expression.length;
        for (var i = length - 1; i >= 0; i--) {
            if (acorn.isIdentifierChar(expression.charCodeAt(i)))
                current = expression.charAt(i) + current;
            else if (expression.charAt(i) === '.') {
                if (context)
                    context.unshift(current);
                else {
                    word = current;
                    context = [];
                }
                current = '';
            } else {
                break;
            }
        }
        if (context)
            context.unshift(current);
        else
            word = current;
        var end = expression.length, start = end - word.length;
        result.start = start;
        result.end = end;

        if (query.caseInsensitive) word = word.toLowerCase();
        var wrapAsObjs = true;//query.types || query.depths || query.docs || query.urls || query.origins;

        function createCompletionIfMatch(prop, obj, module, angularType) {
            if (startsWithString(prop, word)) {
                var completion = createCompletion(prop, obj, scope, query, module, angularType);
                completions.push(completion);
                return completion;
            }
        }

        function completionDirectives(_angular, files, moduleName) {
            visitDirectives(_angular, files, moduleName, function (name, node,
                fnType) {
                var completion = createCompletionIfMatch(name, fnType, moduleName, 'directive')
                if (completion && fnType.originNode && fnType.originNode.properties) {
                    var properties = fnType.originNode.properties;
                    for (var i = 0; i < properties.length; i++) {
                        var p = properties[i];
                        if (p.key.name === 'restrict' && p.value.type === 'Literal') {
                            completion.restrict = p.value.value;
                        }
                    }
                }
            });
        }
        var moduleName = scope ? scope.module : null, controllerName;

        function gather(prop, obj, depth, useObjAsVal) {
            // 'hasOwnProperty' and such are usually just noise, leave them
            // out when no prefix is provided.
            //if (query.omitObjectPrototype !== false && obj == srv.cx.protos.Object && !word) return;
            if (query.filter !== false && word &&
                (query.caseInsensitive ? prop.toLowerCase() : prop).indexOf(word) != 0) return;

            var val = null;
            if (obj) val = useObjAsVal ? obj : obj.props[prop];
            if (!val) val = infer.ANull;

            for (var i = 0; i < completions.length; ++i) {
                var c = completions[i];
                if ((wrapAsObjs ? c.name : c) == prop) {
                    if (c.type === '?' || c.type === '[?]') {
                        infer.resetGuessing();
                        var type = val.getType();
                        //if (query.types)
                        c.type = infer.toString(type);
                    }
                    return;
                }
            }
            var rec = wrapAsObjs ? { name: prop } : prop;
            completions.push(rec);

            //if (query.types || query.docs || query.urls || query.origins) {
            infer.resetGuessing();
            var type = val.getType();
            rec.guess = infer.didGuess();
            //if (query.types)
            rec.type = infer.toString(type);
            //if (query.docs)
            maybeSet(rec, "doc", val.doc || type && type.doc);
            //if (query.urls)
            maybeSet(rec, "url", val.url || type && type.url);
            //if (query.origins)
            maybeSet(rec, "origin", val.origin || type && type.origin);
            //}
            if (query.depths) rec.depth = depth;
            if (moduleName) rec.module = moduleName;
            if (controllerName) rec.controller = controllerName;
        }

        for (var i = 0; i < angularTypes.length; i++) {
            var angularType = angularTypes[i];

            switch (angularType) {
                case 'module':
                    // find modules
                    visitModules(_angular, files, function (moduleName, module) {
                        createCompletionIfMatch(moduleName, module, moduleName, 'module')
                    });
                    break;
                case 'controller':
                    // find controller
                    visitControllers(_angular, files, moduleName, function (name, node,
                        fnType, scopeArg) {
                        createCompletionIfMatch(name, fnType, moduleName, 'controller')
                    });
                    break;
                case 'directive':
                    // find directives for a module
                    completionDirectives(_angular, files, moduleName);
                    break;
                case 'directives':
                    // find directives for the all modules.
                    for (var moduleName in _angular.modules) {
                        completionDirectives(_angular, files, moduleName);
                    }
                    break;
                case 'filter':
                    // find filters for a module
                    visitFilters(_angular, files, moduleName, function (name, node,
                        fnType) {
                        createCompletionIfMatch(name, fnType, moduleName, 'filter')
                    });
                    break;
                case 'factory':
                    // find factories for a module
                    visitFactories(_angular, files, moduleName, function (name, node,
                        fnType) {
                        createCompletionIfMatch(name, fnType, moduleName, 'factory')
                    });
                    break;
                case 'provider':
                    // find providers for a module
                    visitProviders(_angular, files, moduleName, function (name, node,
                        fnType) {
                        createCompletionIfMatch(name, fnType, moduleName, 'provider')
                    });
                    break;
                case 'service':
                    // find services for a module
                    visitServices(_angular, files, moduleName, function (name, node,
                        fnType) {
                        createCompletionIfMatch(name, fnType, moduleName, 'service')
                    });
                    break;
                default:

                    var controllers = scope.controllers, scopeProps = scope.props;
                    if (controllers) {
                        for (var j = 0; j < controllers.length; j++) {
                            controllerName = controllers[j];
                            var scopeCtrl = getScopeController(_angular, files, moduleName,
                                controllerName);
                            if (scopeCtrl) {
                                if (context) {
                                    var root = scopeCtrl;
                                    for (var i = 0; i < context.length; i++) {
                                        var prop = context[i];
                                        if (scopeProps && scopeProps[prop] && scopeProps[prop].repeat) {
                                            var arrProp = scopeProps[prop].repeat; // case when ngRepeat;
                                            root = getArrType(root, arrProp);
                                        } else {
                                            root = getType(root, prop)
                                        }
                                        if (!root)
                                            break;
                                    }
                                    if (root) infer.forAllPropertiesOf(root, gather);
                                } else {
                                    if (scopeProps) {
                                        for (var prop in scopeProps) {
                                            if (startsWithString(prop, word)) {
                                                var obj = null;
                                                if (scopeProps[prop].repeat) {
                                                    var arrProp = scopeProps[prop].repeat; // case when ngRepeat;
                                                    obj = getArrType(scopeCtrl, arrProp);
                                                }
                                                gather(prop, obj, null, true);
                                            }
                                        }
                                    }

                                    var scopeType = scopeCtrl.getType(true);
                                    if (scopeType) infer.forAllPropertiesOf(scopeType, gather);
                                    else {
                                        findModels(scopeCtrl, function (forward) {
                                            var prop = forward.prop;
                                            if (prop && forward.type) {
                                                gather(prop, forward.type, null, true);
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }

                    if (!context && scopeProps) {
                        // case when ngModel defines a simple variable (which cannot be defined in the $scope).
                        for (var prop in scopeProps) {
                            if (!scopeProps[prop].repeat) gather(prop, null, null, true);
                        }
                    }
                    // $rootScope of module
                    if (moduleName) {
                        var module = getModule(_angular, files, moduleName)
                        if (module && module.rootScope) {
                            infer.forAllPropertiesOf(module.rootScope, gather);
                            module.rootScope.guessProperties(gather);
                        }
                    }
                    break;
            }
        }
        return result;
    }

    function createCompletion(name, node, scope, query, module, angularType) {
        var completion = { "name": name };
        if (node) {
            var type = infer.toString(node);
            if (type) completion.type = type;
            var origin = node.origin;
            if (origin) completion.origin = origin;
        } else {
            completion.type = "?";
        }
        if (module) completion.module = module;
        if (angularType) completion.angularType = angularType;
        return completion;
    }

    function findDef(_angular, files, expression, scope, angularTypes, query) {
        var angularType = angularTypes[0];
        var node = null;
        switch (angularType) {
            case 'module':
                // find modules
                visitModules(_angular, files, function (moduleName, module) {
                    if (moduleName == expression) {
                        node = module.originNode;
                        return true;
                    }
                });
                break;
            case 'controller':
                var moduleName = scope ? scope.module : null;
                visitControllers(_angular, files, moduleName, function (name, n, fnType, scopeArg) {
                    if (name == expression) {
                        node = n;
                        return true;
                    }
                });
                break;
            case 'directive':
                var moduleName = scope ? scope.module : null;
                visitDirectives(_angular, files, moduleName, function (name, n, fnType) {
                    if (name == expression) {
                        node = n;
                        return true;
                    }
                });
                break;
            case 'filter':
                var moduleName = scope ? scope.module : null;
                visitFilters(_angular, files, moduleName, function (name, n, fnType) {
                    if (name == expression) {
                        node = n;
                        return true;
                    }
                });
                break;
            case 'factory':
                var moduleName = scope ? scope.module : null;
                visitFactories(_angular, files, moduleName, function (name, n, fnType) {
                    if (name == expression) {
                        node = n;
                        return true;
                    }
                });
                break;
            case 'provider':
                var moduleName = scope ? scope.module : null;
                visitProviders(_angular, files, moduleName, function (name, n, fnType) {
                    if (name == expression) {
                        node = n;
                        return true;
                    }
                });
                break;
            case 'service':
                var moduleName = scope ? scope.module : null;
                visitServices(_angular, files, moduleName, function (name, n, fnType) {
                    if (name == expression) {
                        node = n;
                        return true;
                    }
                });
                break;
            default:
                var moduleName = scope.module;
                var controllerName = 'TODO';
                findModels(_angular, files, moduleName, controllerName, function (forward) {
                    var prop = forward.prop;
                    if (prop == expression) {
                        node = forward;
                        return true;
                    }
                });
                break;
        }
        if (node) {
            return { file: node.sourceFile.name, start: node.start, end: node.end };
        }
        return {};
    }



    function findType(_angular, files, expression, scope, angularTypes, query) {
        var angularType = angularTypes[0];
        var type, name, origin = null;
        switch (angularType) {
            case 'module':
                // find modules
                visitModules(_angular, files, function (moduleName, module) {
                    if (moduleName == expression) {
                        name = moduleName;
                        type = module;
                        return true;
                    }
                });
                break;
            case 'controller':
                var moduleName = scope.module;
                visitControllers(_angular, files, moduleName, function (n, node,
                    fnType, scopeArg) {
                    if (n == expression) {
                        name = n;
                        type = fnType;
                        return true;
                    }
                });
                break;
            case 'directive':
                var moduleName = scope.module;
                visitDirectives(_angular, files, moduleName, function (n, node,
                    fnType) {
                    if (n == expression) {
                        name = n;
                        type = fnType;
                        return true;
                    }
                });
                break;

            default:
                var moduleName = scope.module;
                var controllerName = 'TODO';
                findModels(_angular, files, moduleName, controllerName, function (
                    forward) {
                    var prop = forward.prop;
                    if (prop == expression) {
                        name = prop;
                        type = forward.type;
                        return true;
                    }
                });
                break;
        }
        if (type) {
            return {
                type: infer.toString(type),
                name: name,
                origin: type.origin
            }
        }
        return {};
    }


    function ternError(msg) {
        var err = new Error(msg);
        err.name = "TernError";
        return err;
    }

});


//#endregion


//#region tern/defs/browser.json

var def_browser = {
    "!name": "browser",
    "location": {
        "assign": {
            "!type": "fn(url: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "Load the document at the provided URL."
        },
        "replace": {
            "!type": "fn(url: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "Replace the current document with the one at the provided URL. The difference from the assign() method is that after using replace() the current page will not be saved in session history, meaning the user won't be able to use the Back button to navigate to it."
        },
        "reload": {
            "!type": "fn()",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "Reload the document from the current URL. forceget is a boolean, which, when it is true, causes the page to always be reloaded from the server. If it is false or not specified, the browser may reload the page from its cache."
        },
        "origin": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The origin of the URL."
        },
        "hash": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The part of the URL that follows the # symbol, including the # symbol."
        },
        "search": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The part of the URL that follows the ? symbol, including the ? symbol."
        },
        "pathname": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The path (relative to the host)."
        },
        "port": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The port number of the URL."
        },
        "hostname": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The host name (without the port number or square brackets)."
        },
        "host": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The host name and port number."
        },
        "protocol": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The protocol of the URL."
        },
        "href": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
            "!doc": "The entire URL."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
        "!doc": "Returns a location object with information about the current location of the document. Assigning to the location property changes the current page to the new address."
    },
    "Node": {
        "!type": "fn()",
        "prototype": {
            "parentElement": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.parentElement",
                "!doc": "Returns the DOM node's parent Element, or null if the node either has no parent, or its parent isn't a DOM Element."
            },
            "textContent": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.textContent",
                "!doc": "Gets or sets the text content of a node and its descendants."
            },
            "baseURI": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.baseURI",
                "!doc": "The absolute base URI of a node or null if unable to obtain an absolute URI."
            },
            "localName": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.localName",
                "!doc": "Returns the local part of the qualified name of this node."
            },
            "prefix": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.prefix",
                "!doc": "Returns the namespace prefix of the specified node, or null if no prefix is specified. This property is read only."
            },
            "namespaceURI": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.namespaceURI",
                "!doc": "The namespace URI of the node, or null if the node is not in a namespace (read-only). When the node is a document, it returns the XML namespace for the current document."
            },
            "ownerDocument": {
                "!type": "+Document",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.ownerDocument",
                "!doc": "The ownerDocument property returns the top-level document object for this node."
            },
            "attributes": {
                "!type": "+NamedNodeMap",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.attributes",
                "!doc": "A collection of all attribute nodes registered to the specified node. It is a NamedNodeMap,not an Array, so it has no Array methods and the Attr nodes' indexes may differ among browsers."
            },
            "nextSibling": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nextSibling",
                "!doc": "Returns the node immediately following the specified one in its parent's childNodes list, or null if the specified node is the last node in that list."
            },
            "previousSibling": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.previousSibling",
                "!doc": "Returns the node immediately preceding the specified one in its parent's childNodes list, null if the specified node is the first in that list."
            },
            "lastChild": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.lastChild",
                "!doc": "Returns the last child of a node."
            },
            "firstChild": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.firstChild",
                "!doc": "Returns the node's first child in the tree, or null if the node is childless. If the node is a Document, it returns the first node in the list of its direct children."
            },
            "childNodes": {
                "!type": "+NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.childNodes",
                "!doc": "Returns a collection of child nodes of the given element."
            },
            "parentNode": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.parentNode",
                "!doc": "Returns the parent of the specified node in the DOM tree."
            },
            "nodeType": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeType",
                "!doc": "Returns an integer code representing the type of the node."
            },
            "nodeValue": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeValue",
                "!doc": "Returns or sets the value of the current node."
            },
            "nodeName": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeName",
                "!doc": "Returns the name of the current node as a string."
            },
            "tagName": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeName",
                "!doc": "Returns the name of the current node as a string."
            },
            "insertBefore": {
                "!type": "fn(newElt: +Element, before: +Element) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.insertBefore",
                "!doc": "Inserts the specified node before a reference element as a child of the current node."
            },
            "replaceChild": {
                "!type": "fn(newElt: +Element, oldElt: +Element) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.replaceChild",
                "!doc": "Replaces one child node of the specified element with another."
            },
            "removeChild": {
                "!type": "fn(oldElt: +Element) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.removeChild",
                "!doc": "Removes a child node from the DOM. Returns removed node."
            },
            "appendChild": {
                "!type": "fn(newElt: +Element) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.appendChild",
                "!doc": "Adds a node to the end of the list of children of a specified parent node. If the node already exists it is removed from current parent node, then added to new parent node."
            },
            "hasChildNodes": {
                "!type": "fn() -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.hasChildNodes",
                "!doc": "Returns a Boolean value indicating whether the current Node has child nodes or not."
            },
            "cloneNode": {
                "!type": "fn(deep: bool) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.cloneNode",
                "!doc": "Returns a duplicate of the node on which this method was called."
            },
            "normalize": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.normalize",
                "!doc": "Puts the specified node and all of its subtree into a \"normalized\" form. In a normalized subtree, no text nodes in the subtree are empty and there are no adjacent text nodes."
            },
            "isSupported": {
                "!type": "fn(features: string, version: number) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isSupported",
                "!doc": "Tests whether the DOM implementation implements a specific feature and that feature is supported by this node."
            },
            "hasAttributes": {
                "!type": "fn() -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.hasAttributes",
                "!doc": "Returns a boolean value of true or false, indicating if the current element has any attributes or not."
            },
            "lookupPrefix": {
                "!type": "fn(uri: string) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.lookupPrefix",
                "!doc": "Returns the prefix for a given namespaceURI if present, and null if not. When multiple prefixes are possible, the result is implementation-dependent."
            },
            "isDefaultNamespace": {
                "!type": "fn(uri: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isDefaultNamespace",
                "!doc": "Accepts a namespace URI as an argument and returns true if the namespace is the default namespace on the given node or false if not."
            },
            "lookupNamespaceURI": {
                "!type": "fn(uri: string) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.lookupNamespaceURI",
                "!doc": "Takes a prefix and returns the namespaceURI associated with it on the given node if found (and null if not). Supplying null for the prefix will return the default namespace."
            },
            "addEventListener": {
                "!type": "fn(type: string, listener: fn(e: +Event), capture: bool)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.addEventListener",
                "!doc": "Registers a single event listener on a single target. The event target may be a single element in a document, the document itself, a window, or an XMLHttpRequest."
            },
            "removeEventListener": {
                "!type": "fn(type: string, listener: fn(), capture: bool)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.removeEventListener",
                "!doc": "Allows the removal of event listeners from the event target."
            },
            "isSameNode": {
                "!type": "fn(other: +Node) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isSameNode",
                "!doc": "Tests whether two nodes are the same, that is they reference the same object."
            },
            "isEqualNode": {
                "!type": "fn(other: +Node) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isEqualNode",
                "!doc": "Tests whether two nodes are equal."
            },
            "compareDocumentPosition": {
                "!type": "fn(other: +Node) -> number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.compareDocumentPosition",
                "!doc": "Compares the position of the current node against another node in any other document."
            },
            "contains": {
                "!type": "fn(other: +Node) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Node.contains",
                "!doc": "Indicates whether a node is a descendent of a given node."
            },
            "dispatchEvent": {
                "!type": "fn(event: +Event) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.dispatchEvent",
                "!doc": "Dispatches an event into the event system. The event is subject to the same capturing and bubbling behavior as directly dispatched events."
            },
            "ELEMENT_NODE": "number",
            "ATTRIBUTE_NODE": "number",
            "TEXT_NODE": "number",
            "CDATA_SECTION_NODE": "number",
            "ENTITY_REFERENCE_NODE": "number",
            "ENTITY_NODE": "number",
            "PROCESSING_INSTRUCTION_NODE": "number",
            "COMMENT_NODE": "number",
            "DOCUMENT_NODE": "number",
            "DOCUMENT_TYPE_NODE": "number",
            "DOCUMENT_FRAGMENT_NODE": "number",
            "NOTATION_NODE": "number",
            "DOCUMENT_POSITION_DISCONNECTED": "number",
            "DOCUMENT_POSITION_PRECEDING": "number",
            "DOCUMENT_POSITION_FOLLOWING": "number",
            "DOCUMENT_POSITION_CONTAINS": "number",
            "DOCUMENT_POSITION_CONTAINED_BY": "number",
            "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC": "number"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node",
        "!doc": "A Node is an interface from which a number of DOM types inherit, and allows these various types to be treated (or tested) similarly."
    },
    "Element": {
        "!type": "fn()",
        "prototype": {
            "!proto": "Node.prototype",
            "getAttribute": {
                "!type": "fn(name: string) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttribute",
                "!doc": "Returns the value of the named attribute on the specified element. If the named attribute does not exist, the value returned will either be null or \"\" (the empty string)."
            },
            "setAttribute": {
                "!type": "fn(name: string, value: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttribute",
                "!doc": "Adds a new attribute or changes the value of an existing attribute on the specified element."
            },
            "removeAttribute": {
                "!type": "fn(name: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.removeAttribute",
                "!doc": "Removes an attribute from the specified element."
            },
            "getAttributeNode": {
                "!type": "fn(name: string) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttributeNode",
                "!doc": "Returns the specified attribute of the specified element, as an Attr node."
            },
            "getElementsByTagName": {
                "!type": "fn(tagName: string) -> +NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getElementsByTagName",
                "!doc": "Returns a list of elements with the given tag name. The subtree underneath the specified element is searched, excluding the element itself. The returned list is live, meaning that it updates itself with the DOM tree automatically. Consequently, there is no need to call several times element.getElementsByTagName with the same element and arguments."
            },
            "getElementsByTagNameNS": {
                "!type": "fn(ns: string, tagName: string) -> +NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getElementsByTagNameNS",
                "!doc": "Returns a list of elements with the given tag name belonging to the given namespace."
            },
            "getAttributeNS": {
                "!type": "fn(ns: string, name: string) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttributeNS",
                "!doc": "Returns the string value of the attribute with the specified namespace and name. If the named attribute does not exist, the value returned will either be null or \"\" (the empty string)."
            },
            "setAttributeNS": {
                "!type": "fn(ns: string, name: string, value: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttributeNS",
                "!doc": "Adds a new attribute or changes the value of an attribute with the given namespace and name."
            },
            "removeAttributeNS": {
                "!type": "fn(ns: string, name: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.removeAttributeNS",
                "!doc": "removeAttributeNS removes the specified attribute from an element."
            },
            "getAttributeNodeNS": {
                "!type": "fn(ns: string, name: string) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttributeNodeNS",
                "!doc": "Returns the Attr node for the attribute with the given namespace and name."
            },
            "hasAttribute": {
                "!type": "fn(name: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.hasAttribute",
                "!doc": "hasAttribute returns a boolean value indicating whether the specified element has the specified attribute or not."
            },
            "hasAttributeNS": {
                "!type": "fn(ns: string, name: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.hasAttributeNS",
                "!doc": "hasAttributeNS returns a boolean value indicating whether the current element has the specified attribute."
            },
            "focus": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.focus",
                "!doc": "Sets focus on the specified element, if it can be focused."
            },
            "blur": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.blur",
                "!doc": "The blur method removes keyboard focus from the current element."
            },
            "scrollIntoView": {
                "!type": "fn(top: bool)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollIntoView",
                "!doc": "The scrollIntoView() method scrolls the element into view."
            },
            "scrollByLines": {
                "!type": "fn(lines: number)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollByLines",
                "!doc": "Scrolls the document by the given number of lines."
            },
            "scrollByPages": {
                "!type": "fn(pages: number)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollByPages",
                "!doc": "Scrolls the current document by the specified number of pages."
            },
            "getElementsByClassName": {
                "!type": "fn(name: string) -> +NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByClassName",
                "!doc": "Returns a set of elements which have all the given class names. When called on the document object, the complete document is searched, including the root node. You may also call getElementsByClassName on any element; it will return only elements which are descendants of the specified root element with the given class names."
            },
            "querySelector": {
                "!type": "fn(selectors: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.querySelector",
                "!doc": "Returns the first element that is a descendent of the element on which it is invoked that matches the specified group of selectors."
            },
            "querySelectorAll": {
                "!type": "fn(selectors: string) -> +NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.querySelectorAll",
                "!doc": "Returns a non-live NodeList of all elements descended from the element on which it is invoked that match the specified group of CSS selectors."
            },
            "getClientRects": {
                "!type": "fn() -> [+ClientRect]",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
                "!doc": "Returns a collection of rectangles that indicate the bounding rectangles for each box in a client."
            },
            "getBoundingClientRect": {
                "!type": "fn() -> +ClientRect",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getBoundingClientRect",
                "!doc": "Returns a text rectangle object that encloses a group of text rectangles."
            },
            "setAttributeNode": {
                "!type": "fn(attr: +Attr) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttributeNode",
                "!doc": "Adds a new Attr node to the specified element."
            },
            "removeAttributeNode": {
                "!type": "fn(attr: +Attr) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.removeAttributeNode",
                "!doc": "Removes the specified attribute from the current element."
            },
            "setAttributeNodeNS": {
                "!type": "fn(attr: +Attr) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttributeNodeNS",
                "!doc": "Adds a new namespaced attribute node to an element."
            },
            "insertAdjacentHTML": {
                "!type": "fn(position: string, text: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.insertAdjacentHTML",
                "!doc": "Parses the specified text as HTML or XML and inserts the resulting nodes into the DOM tree at a specified position. It does not reparse the element it is being used on and thus it does not corrupt the existing elements inside the element. This, and avoiding the extra step of serialization make it much faster than direct innerHTML manipulation."
            },
            "children": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.children",
                "!doc": "Returns a collection of child elements of the given element."
            },
            "childElementCount": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.childElementCount",
                "!doc": "Returns the number of child elements of the given element."
            },
            "className": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.className",
                "!doc": "Gets and sets the value of the class attribute of the specified element."
            },
            "style": {
                "cssText": "string",
                "alignmentBaseline": "string",
                "background": "string",
                "backgroundAttachment": "string",
                "backgroundClip": "string",
                "backgroundColor": "string",
                "backgroundImage": "string",
                "backgroundOrigin": "string",
                "backgroundPosition": "string",
                "backgroundPositionX": "string",
                "backgroundPositionY": "string",
                "backgroundRepeat": "string",
                "backgroundRepeatX": "string",
                "backgroundRepeatY": "string",
                "backgroundSize": "string",
                "baselineShift": "string",
                "border": "string",
                "borderBottom": "string",
                "borderBottomColor": "string",
                "borderBottomLeftRadius": "string",
                "borderBottomRightRadius": "string",
                "borderBottomStyle": "string",
                "borderBottomWidth": "string",
                "borderCollapse": "string",
                "borderColor": "string",
                "borderImage": "string",
                "borderImageOutset": "string",
                "borderImageRepeat": "string",
                "borderImageSlice": "string",
                "borderImageSource": "string",
                "borderImageWidth": "string",
                "borderLeft": "string",
                "borderLeftColor": "string",
                "borderLeftStyle": "string",
                "borderLeftWidth": "string",
                "borderRadius": "string",
                "borderRight": "string",
                "borderRightColor": "string",
                "borderRightStyle": "string",
                "borderRightWidth": "string",
                "borderSpacing": "string",
                "borderStyle": "string",
                "borderTop": "string",
                "borderTopColor": "string",
                "borderTopLeftRadius": "string",
                "borderTopRightRadius": "string",
                "borderTopStyle": "string",
                "borderTopWidth": "string",
                "borderWidth": "string",
                "bottom": "string",
                "boxShadow": "string",
                "boxSizing": "string",
                "captionSide": "string",
                "clear": "string",
                "clip": "string",
                "clipPath": "string",
                "clipRule": "string",
                "color": "string",
                "colorInterpolation": "string",
                "colorInterpolationFilters": "string",
                "colorProfile": "string",
                "colorRendering": "string",
                "content": "string",
                "counterIncrement": "string",
                "counterReset": "string",
                "cursor": "string",
                "direction": "string",
                "display": "string",
                "dominantBaseline": "string",
                "emptyCells": "string",
                "enableBackground": "string",
                "fill": "string",
                "fillOpacity": "string",
                "fillRule": "string",
                "filter": "string",
                "float": "string",
                "floodColor": "string",
                "floodOpacity": "string",
                "font": "string",
                "fontFamily": "string",
                "fontSize": "string",
                "fontStretch": "string",
                "fontStyle": "string",
                "fontVariant": "string",
                "fontWeight": "string",
                "glyphOrientationHorizontal": "string",
                "glyphOrientationVertical": "string",
                "height": "string",
                "imageRendering": "string",
                "kerning": "string",
                "left": "string",
                "letterSpacing": "string",
                "lightingColor": "string",
                "lineHeight": "string",
                "listStyle": "string",
                "listStyleImage": "string",
                "listStylePosition": "string",
                "listStyleType": "string",
                "margin": "string",
                "marginBottom": "string",
                "marginLeft": "string",
                "marginRight": "string",
                "marginTop": "string",
                "marker": "string",
                "markerEnd": "string",
                "markerMid": "string",
                "markerStart": "string",
                "mask": "string",
                "maxHeight": "string",
                "maxWidth": "string",
                "minHeight": "string",
                "minWidth": "string",
                "opacity": "string",
                "orphans": "string",
                "outline": "string",
                "outlineColor": "string",
                "outlineOffset": "string",
                "outlineStyle": "string",
                "outlineWidth": "string",
                "overflow": "string",
                "overflowWrap": "string",
                "overflowX": "string",
                "overflowY": "string",
                "padding": "string",
                "paddingBottom": "string",
                "paddingLeft": "string",
                "paddingRight": "string",
                "paddingTop": "string",
                "page": "string",
                "pageBreakAfter": "string",
                "pageBreakBefore": "string",
                "pageBreakInside": "string",
                "pointerEvents": "string",
                "position": "string",
                "quotes": "string",
                "resize": "string",
                "right": "string",
                "shapeRendering": "string",
                "size": "string",
                "speak": "string",
                "src": "string",
                "stopColor": "string",
                "stopOpacity": "string",
                "stroke": "string",
                "strokeDasharray": "string",
                "strokeDashoffset": "string",
                "strokeLinecap": "string",
                "strokeLinejoin": "string",
                "strokeMiterlimit": "string",
                "strokeOpacity": "string",
                "strokeWidth": "string",
                "tabSize": "string",
                "tableLayout": "string",
                "textAlign": "string",
                "textAnchor": "string",
                "textDecoration": "string",
                "textIndent": "string",
                "textLineThrough": "string",
                "textLineThroughColor": "string",
                "textLineThroughMode": "string",
                "textLineThroughStyle": "string",
                "textLineThroughWidth": "string",
                "textOverflow": "string",
                "textOverline": "string",
                "textOverlineColor": "string",
                "textOverlineMode": "string",
                "textOverlineStyle": "string",
                "textOverlineWidth": "string",
                "textRendering": "string",
                "textShadow": "string",
                "textTransform": "string",
                "textUnderline": "string",
                "textUnderlineColor": "string",
                "textUnderlineMode": "string",
                "textUnderlineStyle": "string",
                "textUnderlineWidth": "string",
                "top": "string",
                "unicodeBidi": "string",
                "unicodeRange": "string",
                "vectorEffect": "string",
                "verticalAlign": "string",
                "visibility": "string",
                "whiteSpace": "string",
                "width": "string",
                "wordBreak": "string",
                "wordSpacing": "string",
                "wordWrap": "string",
                "writingMode": "string",
                "zIndex": "string",
                "zoom": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.style",
                "!doc": "Returns an object that represents the element's style attribute."
            },
            "classList": {
                "!type": "+DOMTokenList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.classList",
                "!doc": "Returns a token list of the class attribute of the element."
            },
            "contentEditable": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.contentEditable",
                "!doc": "Indicates whether or not the element is editable."
            },
            "firstElementChild": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.firstElementChild",
                "!doc": "Returns the element's first child element or null if there are no child elements."
            },
            "lastElementChild": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.lastElementChild",
                "!doc": "Returns the element's last child element or null if there are no child elements."
            },
            "nextElementSibling": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.nextElementSibling",
                "!doc": "Returns the element immediately following the specified one in its parent's children list, or null if the specified element is the last one in the list."
            },
            "previousElementSibling": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Element.previousElementSibling",
                "!doc": "Returns the element immediately prior to the specified one in its parent's children list, or null if the specified element is the first one in the list."
            },
            "tabIndex": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.tabIndex",
                "!doc": "Gets/sets the tab order of the current element."
            },
            "title": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.title",
                "!doc": "Establishes the text to be displayed in a 'tool tip' popup when the mouse is over the displayed node."
            },
            "width": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetWidth",
                "!doc": "Returns the layout width of an element."
            },
            "height": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetHeight",
                "!doc": "Height of an element relative to the element's offsetParent."
            },
            "getContext": {
                "!type": "fn(id: string) -> CanvasRenderingContext2D",
                "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCanvasElement",
                "!doc": "DOM canvas elements expose the HTMLCanvasElement interface, which provides properties and methods for manipulating the layout and presentation of canvas elements. The HTMLCanvasElement interface inherits the properties and methods of the element object interface."
            },
            "supportsContext": "fn(id: string) -> bool",
            "oncopy": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.oncopy",
                "!doc": "The oncopy property returns the onCopy event handler code on the current element."
            },
            "oncut": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.oncut",
                "!doc": "The oncut property returns the onCut event handler code on the current element."
            },
            "onpaste": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onpaste",
                "!doc": "The onpaste property returns the onPaste event handler code on the current element."
            },
            "onbeforeunload": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/HTML/Element/body",
                "!doc": "The HTML <body> element represents the main content of an HTML document. There is only one <body> element in a document."
            },
            "onfocus": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onfocus",
                "!doc": "The onfocus property returns the onFocus event handler code on the current element."
            },
            "onblur": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onblur",
                "!doc": "The onblur property returns the onBlur event handler code, if any, that exists on the current element."
            },
            "onchange": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onchange",
                "!doc": "The onchange property sets and returns the onChange event handler code for the current element."
            },
            "onclick": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onclick",
                "!doc": "The onclick property returns the onClick event handler code on the current element."
            },
            "ondblclick": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.ondblclick",
                "!doc": "The ondblclick property returns the onDblClick event handler code on the current element."
            },
            "onmousedown": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmousedown",
                "!doc": "The onmousedown property returns the onMouseDown event handler code on the current element."
            },
            "onmouseup": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseup",
                "!doc": "The onmouseup property returns the onMouseUp event handler code on the current element."
            },
            "onmousewheel": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/wheel",
                "!doc": "The wheel event is fired when a wheel button of a pointing device (usually a mouse) is rotated. This event deprecates the legacy mousewheel event."
            },
            "onmouseover": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseover",
                "!doc": "The onmouseover property returns the onMouseOver event handler code on the current element."
            },
            "onmouseout": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseout",
                "!doc": "The onmouseout property returns the onMouseOut event handler code on the current element."
            },
            "onmousemove": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmousemove",
                "!doc": "The onmousemove property returns the mousemove event handler code on the current element."
            },
            "oncontextmenu": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/window.oncontextmenu",
                "!doc": "An event handler property for right-click events on the window. Unless the default behavior is prevented, the browser context menu will activate. Note that this event will occur with any non-disabled right-click event and does not depend on an element possessing the \"contextmenu\" attribute."
            },
            "onkeydown": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeydown",
                "!doc": "The onkeydown property returns the onKeyDown event handler code on the current element."
            },
            "onkeyup": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeyup",
                "!doc": "The onkeyup property returns the onKeyUp event handler code for the current element."
            },
            "onkeypress": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeypress",
                "!doc": "The onkeypress property sets and returns the onKeyPress event handler code for the current element."
            },
            "onresize": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onresize",
                "!doc": "onresize returns the element's onresize event handler code. It can also be used to set the code to be executed when the resize event occurs."
            },
            "onscroll": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.onscroll",
                "!doc": "The onscroll property returns the onScroll event handler code on the current element."
            },
            "ondragstart": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
                "!doc": "The following describes the steps that occur during a drag and drop operation."
            },
            "ondragover": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragover",
                "!doc": "The dragover event is fired when an element or text selection is being dragged over a valid drop target (every few hundred milliseconds)."
            },
            "ondragleave": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragleave",
                "!doc": "The dragleave event is fired when a dragged element or text selection leaves a valid drop target."
            },
            "ondragenter": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragenter",
                "!doc": "The dragenter event is fired when a dragged element or text selection enters a valid drop target."
            },
            "ondragend": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragend",
                "!doc": "The dragend event is fired when a drag operation is being ended (by releasing a mouse button or hitting the escape key)."
            },
            "ondrag": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/drag",
                "!doc": "The drag event is fired when an element or text selection is being dragged (every few hundred milliseconds)."
            },
            "offsetTop": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetTop",
                "!doc": "Returns the distance of the current element relative to the top of the offsetParent node."
            },
            "offsetLeft": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetLeft",
                "!doc": "Returns the number of pixels that the upper left corner of the current element is offset to the left within the offsetParent node."
            },
            "offsetHeight": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetHeight",
                "!doc": "Height of an element relative to the element's offsetParent."
            },
            "offsetWidth": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetWidth",
                "!doc": "Returns the layout width of an element."
            },
            "scrollTop": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollTop",
                "!doc": "Gets or sets the number of pixels that the content of an element is scrolled upward."
            },
            "scrollLeft": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollLeft",
                "!doc": "Gets or sets the number of pixels that an element's content is scrolled to the left."
            },
            "scrollHeight": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollHeight",
                "!doc": "Height of the scroll view of an element; it includes the element padding but not its margin."
            },
            "scrollWidth": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollWidth",
                "!doc": "Read-only property that returns either the width in pixels of the content of an element or the width of the element itself, whichever is greater."
            },
            "clientTop": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientTop",
                "!doc": "The width of the top border of an element in pixels. It does not include the top margin or padding. clientTop is read-only."
            },
            "clientLeft": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientLeft",
                "!doc": "The width of the left border of an element in pixels. It includes the width of the vertical scrollbar if the text direction of the element is right-to-left and if there is an overflow causing a left vertical scrollbar to be rendered. clientLeft does not include the left margin or the left padding. clientLeft is read-only."
            },
            "clientHeight": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientHeight",
                "!doc": "Returns the inner height of an element in pixels, including padding but not the horizontal scrollbar height, border, or margin."
            },
            "clientWidth": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientWidth",
                "!doc": "The inner width of an element in pixels. It includes padding but not the vertical scrollbar (if present, if rendered), border or margin."
            },
            "innerHTML": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.innerHTML",
                "!doc": "Sets or gets the HTML syntax describing the element's descendants."
            },
            "createdCallback": {
                "!type": "fn()",
                "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-created-callback",
                "!doc": "This callback is invoked after custom element instance is created and its definition is registered. The actual timing of this callback is defined further in this specification."
            },
            "attachedCallback": {
                "!type": "fn()",
                "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-entered-view-callback",
                "!doc": "Unless specified otherwise, this callback must be enqueued whenever custom element is inserted into a document and this document has a browsing context."
            },
            "detachedCallback": {
                "!type": "fn()",
                "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-left-view-callback",
                "!doc": "Unless specified otherwise, this callback must be enqueued whenever custom element is removed from the document and this document has a browsing context."
            },
            "attributeChangedCallback": {
                "!type": "fn()",
                "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-attribute-changed-callback",
                "!doc": "Unless specified otherwise, this callback must be enqueued whenever custom element's attribute is added, changed or removed."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element",
        "!doc": "Represents an element in an HTML or XML document."
    },
    "Text": {
        "!type": "fn()",
        "prototype": {
            "!proto": "Node.prototype",
            "wholeText": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Text.wholeText",
                "!doc": "Returns all text of all Text nodes logically adjacent to the node.  The text is concatenated in document order.  This allows you to specify any text node and obtain all adjacent text as a single string."
            },
            "splitText": {
                "!type": "fn(offset: number) -> +Text",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Text.splitText",
                "!doc": "Breaks the Text node into two nodes at the specified offset, keeping both nodes in the tree as siblings."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Text",
        "!doc": "In the DOM, the Text interface represents the textual content of an Element or Attr.  If an element has no markup within its content, it has a single child implementing Text that contains the element's text.  However, if the element contains markup, it is parsed into information items and Text nodes that form its children."
    },
    "Document": {
        "!type": "fn()",
        "prototype": {
            "!proto": "Node.prototype",
            "activeElement": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.activeElement",
                "!doc": "Returns the currently focused element, that is, the element that will get keystroke events if the user types any. This attribute is read only."
            },
            "compatMode": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.compatMode",
                "!doc": "Indicates whether the document is rendered in Quirks mode or Strict mode."
            },
            "designMode": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.designMode",
                "!doc": "Can be used to make any document editable, for example in a <iframe />:"
            },
            "dir": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Document.dir",
                "!doc": "This property should indicate and allow the setting of the directionality of the text of the document, whether left to right (default) or right to left."
            },
            "height": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.height",
                "!doc": "Returns the height of the <body> element of the current document."
            },
            "width": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.width",
                "!doc": "Returns the width of the <body> element of the current document in pixels."
            },
            "characterSet": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.characterSet",
                "!doc": "Returns the character encoding of the current document."
            },
            "readyState": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.readyState",
                "!doc": "Returns \"loading\" while the document is loading, \"interactive\" once it is finished parsing but still loading sub-resources, and \"complete\" once it has loaded."
            },
            "location": {
                "!type": "location",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.location",
                "!doc": "Returns a Location object, which contains information about the URL of the document and provides methods for changing that URL."
            },
            "lastModified": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.lastModified",
                "!doc": "Returns a string containing the date and time on which the current document was last modified."
            },
            "head": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.head",
                "!doc": "Returns the <head> element of the current document. If there are more than one <head> elements, the first one is returned."
            },
            "body": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.body",
                "!doc": "Returns the <body> or <frameset> node of the current document."
            },
            "cookie": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.cookie",
                "!doc": "Get and set the cookies associated with the current document."
            },
            "URL": "string",
            "domain": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.domain",
                "!doc": "Gets/sets the domain portion of the origin of the current document, as used by the same origin policy."
            },
            "referrer": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.referrer",
                "!doc": "Returns the URI of the page that linked to this page."
            },
            "title": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.title",
                "!doc": "Gets or sets the title of the document."
            },
            "defaultView": {
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.defaultView",
                "!doc": "In browsers returns the window object associated with the document or null if none available."
            },
            "documentURI": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.documentURI",
                "!doc": "Returns the document location as string. It is read-only per DOM4 specification."
            },
            "xmlStandalone": "bool",
            "xmlVersion": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.xmlVersion",
                "!doc": "Returns the version number as specified in the XML declaration (e.g., <?xml version=\"1.0\"?>) or \"1.0\" if the declaration is absent."
            },
            "xmlEncoding": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Document.xmlEncoding",
                "!doc": "Returns the encoding as determined by the XML declaration. Should be null if unspecified or unknown."
            },
            "inputEncoding": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.inputEncoding",
                "!doc": "Returns a string representing the encoding under which the document was parsed (e.g. ISO-8859-1)."
            },
            "documentElement": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.documentElement",
                "!doc": "Read-only"
            },
            "implementation": {
                "hasFeature": "fn(feature: string, version: number) -> bool",
                "createDocumentType": {
                    "!type": "fn(qualifiedName: string, publicId: string, systemId: string) -> +Node",
                    "!url": "https://developer.mozilla.org/en/docs/DOM/DOMImplementation.createDocumentType",
                    "!doc": "Returns a DocumentType object which can either be used with DOMImplementation.createDocument upon document creation or they can be put into the document via Node.insertBefore() or Node.replaceChild(): http://www.w3.org/TR/DOM-Level-3-Cor...l#ID-B63ED1A31 (less ideal due to features not likely being as accessible: http://www.w3.org/TR/DOM-Level-3-Cor...createDocument ). In any case, entity declarations and notations will not be available: http://www.w3.org/TR/DOM-Level-3-Cor...-createDocType   "
                },
                "createHTMLDocument": {
                    "!type": "fn(title: string) -> +Document",
                    "!url": "https://developer.mozilla.org/en/docs/DOM/DOMImplementation.createHTMLDocument",
                    "!doc": "This method (available from document.implementation) creates a new HTML document."
                },
                "createDocument": {
                    "!type": "fn(namespaceURI: string, qualifiedName: string, type: +Node) -> +Document",
                    "!url": "https://developer.mozilla.org/en-US/docs/DOM/DOMImplementation.createHTMLDocument",
                    "!doc": "This method creates a new HTML document."
                },
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.implementation",
                "!doc": "Returns a DOMImplementation object associated with the current document."
            },
            "doctype": {
                "!type": "+Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.doctype",
                "!doc": "Returns the Document Type Declaration (DTD) associated with current document. The returned object implements the DocumentType interface. Use DOMImplementation.createDocumentType() to create a DocumentType."
            },
            "open": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.open",
                "!doc": "The document.open() method opens a document for writing."
            },
            "close": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.close",
                "!doc": "The document.close() method finishes writing to a document, opened with document.open()."
            },
            "write": {
                "!type": "fn(html: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.write",
                "!doc": "Writes a string of text to a document stream opened by document.open()."
            },
            "writeln": {
                "!type": "fn(html: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.writeln",
                "!doc": "Writes a string of text followed by a newline character to a document."
            },
            "clear": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.clear",
                "!doc": "In recent versions of Mozilla-based applications as well as in Internet Explorer and Netscape 4 this method does nothing."
            },
            "hasFocus": {
                "!type": "fn() -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.hasFocus",
                "!doc": "Returns a Boolean value indicating whether the document or any element inside the document has focus. This method can be used to determine whether the active element in a document has focus."
            },
            "createElement": {
                "!type": "fn(tagName: string) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createElement",
                "!doc": "Creates the specified element."
            },
            "createElementNS": {
                "!type": "fn(ns: string, tagName: string) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createElementNS",
                "!doc": "Creates an element with the specified namespace URI and qualified name."
            },
            "createDocumentFragment": {
                "!type": "fn() -> +DocumentFragment",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createDocumentFragment",
                "!doc": "Creates a new empty DocumentFragment."
            },
            "createTextNode": {
                "!type": "fn(content: string) -> +Text",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createTextNode",
                "!doc": "Creates a new Text node."
            },
            "createComment": {
                "!type": "fn(content: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createComment",
                "!doc": "Creates a new comment node, and returns it."
            },
            "createCDATASection": {
                "!type": "fn(content: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createCDATASection",
                "!doc": "Creates a new CDATA section node, and returns it. "
            },
            "createProcessingInstruction": {
                "!type": "fn(content: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createProcessingInstruction",
                "!doc": "Creates a new processing instruction node, and returns it."
            },
            "createAttribute": {
                "!type": "fn(name: string) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createAttribute",
                "!doc": "Creates a new attribute node, and returns it."
            },
            "createAttributeNS": {
                "!type": "fn(ns: string, name: string) -> +Attr",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
                "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
            },
            "importNode": {
                "!type": "fn(node: +Node, deep: bool) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.importNode",
                "!doc": "Creates a copy of a node from an external document that can be inserted into the current document."
            },
            "getElementById": {
                "!type": "fn(id: string) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementById",
                "!doc": "Returns a reference to the element by its ID."
            },
            "getElementsByTagName": {
                "!type": "fn(tagName: string) -> +NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByTagName",
                "!doc": "Returns a NodeList of elements with the given tag name. The complete document is searched, including the root node. The returned NodeList is live, meaning that it updates itself automatically to stay in sync with the DOM tree without having to call document.getElementsByTagName again."
            },
            "getElementsByTagNameNS": {
                "!type": "fn(ns: string, tagName: string) -> +NodeList",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByTagNameNS",
                "!doc": "Returns a list of elements with the given tag name belonging to the given namespace. The complete document is searched, including the root node."
            },
            "createEvent": {
                "!type": "fn(type: string) -> +Event",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createEvent",
                "!doc": "Creates an event of the type specified. The returned object should be first initialized and can then be passed to element.dispatchEvent."
            },
            "createRange": {
                "!type": "fn() -> +Range",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createRange",
                "!doc": "Returns a new Range object."
            },
            "evaluate": {
                "!type": "fn(expr: ?) -> +XPathResult",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.evaluate",
                "!doc": "Returns an XPathResult based on an XPath expression and other given parameters."
            },
            "execCommand": {
                "!type": "fn(cmd: string)",
                "!url": "https://developer.mozilla.org/en-US/docs/Rich-Text_Editing_in_Mozilla#Executing_Commands",
                "!doc": "Run command to manipulate the contents of an editable region."
            },
            "queryCommandEnabled": {
                "!type": "fn(cmd: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document",
                "!doc": "Returns true if the Midas command can be executed on the current range."
            },
            "queryCommandIndeterm": {
                "!type": "fn(cmd: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document",
                "!doc": "Returns true if the Midas command is in a indeterminate state on the current range."
            },
            "queryCommandState": {
                "!type": "fn(cmd: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document",
                "!doc": "Returns true if the Midas command has been executed on the current range."
            },
            "queryCommandSupported": {
                "!type": "fn(cmd: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.queryCommandSupported",
                "!doc": "Reports whether or not the specified editor query command is supported by the browser."
            },
            "queryCommandValue": {
                "!type": "fn(cmd: string) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document",
                "!doc": "Returns the current value of the current range for Midas command."
            },
            "getElementsByName": {
                "!type": "fn(name: string) -> +HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByName",
                "!doc": "Returns a list of elements with a given name in the HTML document."
            },
            "elementFromPoint": {
                "!type": "fn(x: number, y: number) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.elementFromPoint",
                "!doc": "Returns the element from the document whose elementFromPoint method is being called which is the topmost element which lies under the given point.  To get an element, specify the point via coordinates, in CSS pixels, relative to the upper-left-most point in the window or frame containing the document."
            },
            "getSelection": {
                "!type": "fn() -> +Selection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.getSelection",
                "!doc": "The DOM getSelection() method is available on the Window and Document interfaces."
            },
            "adoptNode": {
                "!type": "fn(node: +Node) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.adoptNode",
                "!doc": "Adopts a node from an external document. The node and its subtree is removed from the document it's in (if any), and its ownerDocument is changed to the current document. The node can then be inserted into the current document."
            },
            "createTreeWalker": {
                "!type": "fn(root: +Node, mask: number) -> ?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createTreeWalker",
                "!doc": "Returns a new TreeWalker object."
            },
            "createExpression": {
                "!type": "fn(text: string) -> ?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createExpression",
                "!doc": "This method compiles an XPathExpression which can then be used for (repeated) evaluations."
            },
            "createNSResolver": {
                "!type": "fn(node: +Node)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.createNSResolver",
                "!doc": "Creates an XPathNSResolver which resolves namespaces with respect to the definitions in scope for a specified node."
            },
            "scripts": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Document.scripts",
                "!doc": "Returns a list of the <script> elements in the document. The returned object is an HTMLCollection."
            },
            "plugins": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.plugins",
                "!doc": "Returns an HTMLCollection object containing one or more HTMLEmbedElements or null which represent the <embed> elements in the current document."
            },
            "embeds": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.embeds",
                "!doc": "Returns a list of the embedded OBJECTS within the current document."
            },
            "anchors": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.anchors",
                "!doc": "Returns a list of all of the anchors in the document."
            },
            "links": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.links",
                "!doc": "The links property returns a collection of all AREA elements and anchor elements in a document with a value for the href attribute. "
            },
            "forms": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.forms",
                "!doc": "Returns a collection (an HTMLCollection) of the form elements within the current document."
            },
            "styleSheets": {
                "!type": "+HTMLCollection",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.styleSheets",
                "!doc": "Returns a list of stylesheet objects for stylesheets explicitly linked into or embedded in a document."
            },
            "currentScript": {
                "!type": "+Node",
                "!url": "https://developer.mozilla.org/en-US/docs/Web/API/document.currentScript",
                "!doc": "Returns the <script> element whose script is currently being processed."
            },
            "registerElement": {
                "!type": "fn(type: string, options?: ?)",
                "!url": "http://w3c.github.io/webcomponents/spec/custom/#extensions-to-document-interface-to-register",
                "!doc": "The registerElement method of the Document interface provides a way to register a custom element and returns its custom element constructor."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/document",
        "!doc": "Each web page loaded in the browser has its own document object. This object serves as an entry point to the web page's content (the DOM tree, including elements such as <body> and <table>) and provides functionality global to the document (such as obtaining the page's URL and creating new elements in the document)."
    },
    "document": {
        "!type": "+Document",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document",
        "!doc": "Each web page loaded in the browser has its own document object. This object serves as an entry point to the web page's content (the DOM tree, including elements such as <body> and <table>) and provides functionality global to the document (such as obtaining the page's URL and creating new elements in the document)."
    },
    "XMLDocument": {
        "!type": "fn()",
        "prototype": "Document.prototype",
        "!url": "https://developer.mozilla.org/en/docs/Parsing_and_serializing_XML",
        "!doc": "The Web platform provides the following objects for parsing and serializing XML:"
    },
    "HTMLElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement"
    },
    "HTMLAnchorElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement"
    },
    "HTMLAreaElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLAreaElement"
    },
    "HTMLAudioElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement"
    },
    "HTMLBaseElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLBaseElement"
    },
    "HTMLBodyElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLBodyElement"
    },
    "HTMLBRElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLBRElement"
    },
    "HTMLButtonElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLButtonElement"
    },
    "HTMLCanvasElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement"
    },
    "HTMLDataElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDataElement"
    },
    "HTMLDataListElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDataListElement"
    },
    "HTMLDivElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDivElement"
    },
    "HTMLDListElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDListElement"
    },
    "HTMLDocument": {
        "!type": "Document",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDocument"
    },
    "HTMLEmbedElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLEmbedElement"
    },
    "HTMLFieldSetElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLFieldSetElement"
    },
    "HTMLFormControlsCollection": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormControlsCollection"
    },
    "HTMLFormElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement"
    },
    "HTMLHeadElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHeadElement"
    },
    "HTMLHeadingElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHeadingElement"
    },
    "HTMLHRElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHRElement"
    },
    "HTMLHtmlElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHtmlElement"
    },
    "HTMLIFrameElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement"
    },
    "HTMLImageElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement"
    },
    "HTMLInputElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement"
    },
    "HTMLKeygenElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLKeygenElement"
    },
    "HTMLLabelElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement"
    },
    "HTMLLegendElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLegendElement"
    },
    "HTMLLIElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLIElement"
    },
    "HTMLLinkElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLinkElement"
    },
    "HTMLMapElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMapElement"
    },
    "HTMLMediaElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement"
    },
    "HTMLMetaElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMetaElement"
    },
    "HTMLMeterElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMeterElement"
    },
    "HTMLModElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLModElement"
    },
    "HTMLObjectElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLObjectElement"
    },
    "HTMLOListElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOListElement"
    },
    "HTMLOptGroupElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptGroupElement"
    },
    "HTMLOptionElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptionElement"
    },
    "HTMLOptionsCollection": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptionsCollection"
    },
    "HTMLOutputElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOutputElement"
    },
    "HTMLParagraphElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLParagraphElement"
    },
    "HTMLParamElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLParamElement"
    },
    "HTMLPreElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLPreElement"
    },
    "HTMLProgressElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLProgressElement"
    },
    "HTMLQuoteElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLQuoteElement"
    },
    "HTMLScriptElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement"
    },
    "HTMLSelectElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLSelectElement"
    },
    "HTMLSourceElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLSourceElement"
    },
    "HTMLSpanElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLSpanElement"
    },
    "HTMLStyleElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLStyleElement"
    },
    "HTMLTableCaptionElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableCaptionElement"
    },
    "HTMLTableCellElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableCellElement"
    },
    "HTMLTableColElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableColElement"
    },
    "HTMLTableDataCellElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableDataCellElement"
    },
    "HTMLTableElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableElement"
    },
    "HTMLTableHeaderCellElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableHeaderCellElement"
    },
    "HTMLTableRowElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableRowElement"
    },
    "HTMLTableSectionElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableSectionElement"
    },
    "HTMLTextAreaElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement"
    },
    "HTMLTimeElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTimeElement"
    },
    "HTMLTitleElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTitleElement"
    },
    "HTMLTrackElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTrackElement"
    },
    "HTMLUListElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLUListElement"
    },
    "HTMLUnknownElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLUnknownElement"
    },
    "HTMLVideoElement": {
        "!type": "Element",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement"
    },
    "Attr": {
        "!type": "fn()",
        "prototype": {
            "isId": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
                "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
            },
            "name": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
                "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
            },
            "value": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
                "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
        "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
    },
    "NodeList": {
        "!type": "fn()",
        "prototype": {
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.length",
                "!doc": "Returns the number of items in a NodeList."
            },
            "item": {
                "!type": "fn(i: number) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NodeList.item",
                "!doc": "Returns a node from a NodeList by index."
            },
            "<i>": "+Element"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/NodeList",
        "!doc": "NodeList objects are collections of nodes returned by getElementsByTagName, getElementsByTagNameNS, Node.childNodes, querySelectorAll, getElementsByClassName, etc."
    },
    "HTMLCollection": {
        "!type": "fn()",
        "prototype": {
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
                "!doc": "The number of items in the collection."
            },
            "item": {
                "!type": "fn(i: number) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
                "!doc": "Returns the specific node at the given zero-based index into the list. Returns null if the index is out of range."
            },
            "namedItem": {
                "!type": "fn(name: string) -> +Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
                "!doc": "Returns the specific node whose ID or, as a fallback, name matches the string specified by name. Matching by name is only done as a last resort, only in HTML, and only if the referenced element supports the name attribute. Returns null if no node exists by the given name."
            },
            "<i>": "+Element"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
        "!doc": "HTMLCollection is an interface representing a generic collection of elements (in document order) and offers methods and properties for traversing the list."
    },
    "NamedNodeMap": {
        "!type": "fn()",
        "prototype": {
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "The number of items in the map."
            },
            "getNamedItem": {
                "!type": "fn(name: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Gets a node by name."
            },
            "setNamedItem": {
                "!type": "fn(node: +Node) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Adds (or replaces) a node by its nodeName."
            },
            "removeNamedItem": {
                "!type": "fn(name: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Removes a node (or if an attribute, may reveal a default if present)."
            },
            "item": {
                "!type": "fn(i: number) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Returns the item at the given index (or null if the index is higher or equal to the number of nodes)."
            },
            "getNamedItemNS": {
                "!type": "fn(ns: string, name: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Gets a node by namespace and localName."
            },
            "setNamedItemNS": {
                "!type": "fn(node: +Node) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Adds (or replaces) a node by its localName and namespaceURI."
            },
            "removeNamedItemNS": {
                "!type": "fn(ns: string, name: string) -> +Node",
                "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
                "!doc": "Removes a node (or if an attribute, may reveal a default if present)."
            },
            "<i>": "+Node"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "A collection of nodes returned by Element.attributes (also potentially for DocumentType.entities, DocumentType.notations). NamedNodeMaps are not in any particular order (unlike NodeList), although they may be accessed by an index as in an array (they may also be accessed with the item() method). A NamedNodeMap object are live and will thus be auto-updated if changes are made to their contents internally or elsewhere."
    },
    "DocumentFragment": {
        "!type": "fn()",
        "prototype": {
            "!proto": "Node.prototype"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createDocumentFragment",
        "!doc": "Creates a new empty DocumentFragment."
    },
    "DOMTokenList": {
        "!type": "fn()",
        "prototype": {
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
                "!doc": "The amount of items in the list."
            },
            "item": {
                "!type": "fn(i: number) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
                "!doc": "Returns an item in the list by its index."
            },
            "contains": {
                "!type": "fn(token: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
                "!doc": "Return true if the underlying string contains token, otherwise false."
            },
            "add": {
                "!type": "fn(token: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
                "!doc": "Adds token to the underlying string."
            },
            "remove": {
                "!type": "fn(token: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
                "!doc": "Remove token from the underlying string."
            },
            "toggle": {
                "!type": "fn(token: string) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
                "!doc": "Removes token from string and returns false. If token doesn't exist it's added and the function returns true."
            },
            "<i>": "string"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "This type represents a set of space-separated tokens. Commonly returned by HTMLElement.classList, HTMLLinkElement.relList, HTMLAnchorElement.relList or HTMLAreaElement.relList. It is indexed beginning with 0 as with JavaScript arrays. DOMTokenList is always case-sensitive."
    },
    "XPathResult": {
        "!type": "fn()",
        "prototype": {
            "boolValue": "bool",
            "invalidIteratorState": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
                "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
            },
            "numberValue": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/XPathResult",
                "!doc": "Refer to nsIDOMXPathResult for more detail."
            },
            "resultType": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/document.evaluate",
                "!doc": "Returns an XPathResult based on an XPath expression and other given parameters."
            },
            "singleNodeValue": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
                "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
            },
            "snapshotLength": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/XPathResult",
                "!doc": "Refer to nsIDOMXPathResult for more detail."
            },
            "stringValue": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
                "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
            },
            "iterateNext": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
                "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
            },
            "snapshotItem": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en-US/docs/XPathResult#snapshotItem()"
            },
            "ANY_TYPE": "number",
            "NUMBER_TYPE": "number",
            "STRING_TYPE": "number",
            "BOOL_TYPE": "number",
            "UNORDERED_NODE_ITERATOR_TYPE": "number",
            "ORDERED_NODE_ITERATOR_TYPE": "number",
            "UNORDERED_NODE_SNAPSHOT_TYPE": "number",
            "ORDERED_NODE_SNAPSHOT_TYPE": "number",
            "ANY_UNORDERED_NODE_TYPE": "number",
            "FIRST_ORDERED_NODE_TYPE": "number"
        },
        "!url": "https://developer.mozilla.org/en/docs/XPathResult",
        "!doc": "Refer to nsIDOMXPathResult for more detail."
    },
    "ClientRect": {
        "!type": "fn()",
        "prototype": {
            "top": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
                "!doc": "Top of the box, in pixels, relative to the viewport."
            },
            "left": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
                "!doc": "Left of the box, in pixels, relative to the viewport."
            },
            "bottom": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
                "!doc": "Bottom of the box, in pixels, relative to the viewport."
            },
            "right": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
                "!doc": "Right of the box, in pixels, relative to the viewport."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
        "!doc": "Returns a collection of rectangles that indicate the bounding rectangles for each box in a client."
    },
    "Event": {
        "!type": "fn()",
        "prototype": {
            "stopPropagation": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.stopPropagation",
                "!doc": "Prevents further propagation of the current event."
            },
            "preventDefault": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.preventDefault",
                "!doc": "Cancels the event if it is cancelable, without stopping further propagation of the event."
            },
            "initEvent": {
                "!type": "fn(type: string, bubbles: bool, cancelable: bool)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.initEvent",
                "!doc": "The initEvent method is used to initialize the value of an event created using document.createEvent."
            },
            "stopImmediatePropagation": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.stopImmediatePropagation",
                "!doc": "Prevents other listeners of the same event to be called."
            },
            "NONE": "number",
            "CAPTURING_PHASE": "number",
            "AT_TARGET": "number",
            "BUBBLING_PHASE": "number",
            "MOUSEDOWN": "number",
            "MOUSEUP": "number",
            "MOUSEOVER": "number",
            "MOUSEOUT": "number",
            "MOUSEMOVE": "number",
            "MOUSEDRAG": "number",
            "CLICK": "number",
            "DBLCLICK": "number",
            "KEYDOWN": "number",
            "KEYUP": "number",
            "KEYPRESS": "number",
            "DRAGDROP": "number",
            "FOCUS": "number",
            "BLUR": "number",
            "SELECT": "number",
            "CHANGE": "number",
            "target": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget",
                "!doc": "An EventTarget is a DOM interface implemented by objects that can receive DOM events and have listeners for them. The most common EventTargets are DOM elements, although other objects can be EventTargets too, for example document, window, XMLHttpRequest, and others."
            },
            "relatedTarget": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.relatedTarget",
                "!doc": "Identifies a secondary target for the event."
            },
            "pageX": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.pageX",
                "!doc": "Returns the horizontal coordinate of the event relative to whole document."
            },
            "pageY": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.pageY",
                "!doc": "Returns the vertical coordinate of the event relative to the whole document."
            },
            "clientX": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.clientX",
                "!doc": "Returns the horizontal coordinate within the application's client area at which the event occurred (as opposed to the coordinates within the page). For example, clicking in the top-left corner of the client area will always result in a mouse event with a clientX value of 0, regardless of whether the page is scrolled horizontally."
            },
            "clientY": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.clientY",
                "!doc": "Returns the vertical coordinate within the application's client area at which the event occurred (as opposed to the coordinates within the page). For example, clicking in the top-left corner of the client area will always result in a mouse event with a clientY value of 0, regardless of whether the page is scrolled vertically."
            },
            "keyCode": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.keyCode",
                "!doc": "Returns the Unicode value of a non-character key in a keypress event or any key in any other type of keyboard event."
            },
            "charCode": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.charCode",
                "!doc": "Returns the Unicode value of a character key pressed during a keypress event."
            },
            "which": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.which",
                "!doc": "Returns the numeric keyCode of the key pressed, or the character code (charCode) for an alphanumeric key pressed."
            },
            "button": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.button",
                "!doc": "Indicates which mouse button caused the event."
            },
            "shiftKey": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.shiftKey",
                "!doc": "Indicates whether the SHIFT key was pressed when the event fired."
            },
            "ctrlKey": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.ctrlKey",
                "!doc": "Indicates whether the CTRL key was pressed when the event fired."
            },
            "altKey": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.altKey",
                "!doc": "Indicates whether the ALT key was pressed when the event fired."
            },
            "metaKey": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.metaKey",
                "!doc": "Indicates whether the META key was pressed when the event fired."
            },
            "returnValue": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/window.onbeforeunload",
                "!doc": "An event that fires when a window is about to unload its resources. The document is still visible and the event is still cancelable."
            },
            "cancelBubble": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/event.cancelBubble",
                "!doc": "bool is the boolean value of true or false."
            },
            "dataTransfer": {
                "dropEffect": {
                    "!type": "string",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
                    "!doc": "The actual effect that will be used, and should always be one of the possible values of effectAllowed."
                },
                "effectAllowed": {
                    "!type": "string",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
                    "!doc": "Specifies the effects that are allowed for this drag."
                },
                "files": {
                    "!type": "+FileList",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
                    "!doc": "Contains a list of all the local files available on the data transfer."
                },
                "types": {
                    "!type": "[string]",
                    "!url": "https://developer.mozilla.org/en-US/docs/DragDrop/DataTransfer",
                    "!doc": "Holds a list of the format types of the data that is stored for the first item, in the same order the data was added. An empty list will be returned if no data was added."
                },
                "addElement": {
                    "!type": "fn(element: +Element)",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
                    "!doc": "Set the drag source."
                },
                "clearData": {
                    "!type": "fn(type?: string)",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
                    "!doc": "Remove the data associated with a given type."
                },
                "getData": {
                    "!type": "fn(type: string) -> string",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
                    "!doc": "Retrieves the data for a given type, or an empty string if data for that type does not exist or the data transfer contains no data."
                },
                "setData": {
                    "!type": "fn(type: string, data: string)",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
                    "!doc": "Set the data for a given type."
                },
                "setDragImage": {
                    "!type": "fn(image: +Element)",
                    "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
                    "!doc": "Set the image to be used for dragging if a custom one is desired."
                },
                "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
                "!doc": "This object is available from the dataTransfer property of all drag events. It cannot be created separately."
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/event",
        "!doc": "The DOM Event interface is accessible from within the handler function, via the event object passed as the first argument."
    },
    "TouchEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Touch_events",
        "!doc": "In order to provide quality support for touch-based user interfaces, touch events offer the ability to interpret finger activity on touch screens or trackpads."
    },
    "WheelEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/WheelEvent",
        "!doc": "The DOM WheelEvent represents events that occur due to the user moving a mouse wheel or similar input device."
    },
    "MouseEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/MouseEvent",
        "!doc": "The DOM MouseEvent represents events that occur due to the user interacting with a pointing device (such as a mouse). It's represented by the nsINSDOMMouseEvent interface, which extends the nsIDOMMouseEvent interface."
    },
    "KeyboardEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/KeyboardEvent",
        "!doc": "KeyboardEvent objects describe a user interaction with the keyboard. Each event describes a key; the event type (keydown, keypress, or keyup) identifies what kind of activity was performed."
    },
    "HashChangeEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onhashchange",
        "!doc": "The hashchange event fires when a window's hash changes."
    },
    "ErrorEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOM_event_reference/error",
        "!doc": "The error event is fired whenever a resource fails to load."
    },
    "CustomEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Event/CustomEvent",
        "!doc": "The DOM CustomEvent are events initialized by an application for any purpose."
    },
    "BeforeLoadEvent": {
        "!type": "fn()",
        "prototype": "Event.prototype",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window",
        "!doc": "This section provides a brief reference for all of the methods, properties, and events available through the DOM window object. The window object implements the Window interface, which in turn inherits from the AbstractView interface. Some additional global functions, namespaces objects, and constructors, not typically associated with the window, but available on it, are listed in the JavaScript Reference."
    },
    "WebSocket": {
        "!type": "fn(url: string)",
        "prototype": {
            "close": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/CloseEvent",
                "!doc": "A CloseEvent is sent to clients using WebSockets when the connection is closed. This is delivered to the listener indicated by the WebSocket object's onclose attribute."
            },
            "send": {
                "!type": "fn(data: string)",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
                "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
            },
            "binaryType": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
                "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
            },
            "bufferedAmount": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/Writing_WebSocket_client_applications",
                "!doc": "WebSockets is a technology that makes it possible to open an interactive communication session between the user's browser and a server. Using a WebSocket connection, Web applications can perform real-time communication instead of having to poll for changes back and forth."
            },
            "extensions": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
                "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
            },
            "onclose": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/CloseEvent",
                "!doc": "A CloseEvent is sent to clients using WebSockets when the connection is closed. This is delivered to the listener indicated by the WebSocket object's onclose attribute."
            },
            "onerror": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/Writing_WebSocket_client_applications",
                "!doc": "WebSockets is a technology that makes it possible to open an interactive communication session between the user's browser and a server. Using a WebSocket connection, Web applications can perform real-time communication instead of having to poll for changes back and forth."
            },
            "onmessage": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
                "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
            },
            "onopen": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
                "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
            },
            "protocol": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets",
                "!doc": "WebSockets is an advanced technology that makes it possible to open an interactive communication session between the user's browser and a server. With this API, you can send messages to a server and receive event-driven responses without having to poll the server for a reply."
            },
            "url": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/WebSockets/Writing_WebSocket_client_applications",
                "!doc": "WebSockets is a technology that makes it possible to open an interactive communication session between the user's browser and a server. Using a WebSocket connection, Web applications can perform real-time communication instead of having to poll for changes back and forth."
            },
            "CONNECTING": "number",
            "OPEN": "number",
            "CLOSING": "number",
            "CLOSED": "number"
        },
        "!url": "https://developer.mozilla.org/en/docs/WebSockets",
        "!doc": "WebSockets is an advanced technology that makes it possible to open an interactive communication session between the user's browser and a server. With this API, you can send messages to a server and receive event-driven responses without having to poll the server for a reply."
    },
    "Worker": {
        "!type": "fn(scriptURL: string)",
        "prototype": {
            "postMessage": {
                "!type": "fn(message: ?)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
                "!doc": "Sends a message to the worker's inner scope. This accepts a single parameter, which is the data to send to the worker. The data may be any value or JavaScript object handled by the structured clone algorithm, which includes cyclical references."
            },
            "terminate": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
                "!doc": "Immediately terminates the worker. This does not offer the worker an opportunity to finish its operations; it is simply stopped at once."
            },
            "onmessage": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
                "!doc": "An event listener that is called whenever a MessageEvent with type message bubbles through the worker. The message is stored in the event's data member."
            },
            "onerror": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
                "!doc": "An event listener that is called whenever an ErrorEvent with type error bubbles through the worker."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
        "!doc": "Workers are background tasks that can be easily created and can send messages back to their creators. Creating a worker is as simple as calling the Worker() constructor, specifying a script to be run in the worker thread."
    },
    "localStorage": {
        "setItem": {
            "!type": "fn(name: string, value: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
            "!doc": "Store an item in storage."
        },
        "getItem": {
            "!type": "fn(name: string) -> string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
            "!doc": "Retrieve an item from storage."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
        "!doc": "The DOM Storage mechanism is a means through which string key/value pairs can be securely stored and later retrieved for use."
    },
    "sessionStorage": {
        "setItem": {
            "!type": "fn(name: string, value: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
            "!doc": "Store an item in storage."
        },
        "getItem": {
            "!type": "fn(name: string) -> string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
            "!doc": "Retrieve an item from storage."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
        "!doc": "This is a global object (sessionStorage) that maintains a storage area that's available for the duration of the page session. A page session lasts for as long as the browser is open and survives over page reloads and restores. Opening a page in a new tab or window will cause a new session to be initiated."
    },
    "FileList": {
        "!type": "fn()",
        "prototype": {
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileList",
                "!doc": "A read-only value indicating the number of files in the list."
            },
            "item": {
                "!type": "fn(i: number) -> +File",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileList",
                "!doc": "Returns a File object representing the file at the specified index in the file list."
            },
            "<i>": "+File"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileList",
        "!doc": "An object of this type is returned by the files property of the HTML input element; this lets you access the list of files selected with the <input type=\"file\"> element. It's also used for a list of files dropped into web content when using the drag and drop API."
    },
    "File": {
        "!type": "fn()",
        "prototype": {
            "!proto": "Blob.prototype",
            "fileName": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/File.fileName",
                "!doc": "Returns the name of the file. For security reasons the path is excluded from this property."
            },
            "fileSize": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/File.fileSize",
                "!doc": "Returns the size of a file in bytes."
            },
            "lastModifiedDate": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/File.lastModifiedDate",
                "!doc": "Returns the last modified date of the file. Files without a known last modified date use the current date instead."
            },
            "name": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/File.name",
                "!doc": "Returns the name of the file. For security reasons, the path is excluded from this property."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/File",
        "!doc": "The File object provides information about -- and access to the contents of -- files. These are generally retrieved from a FileList object returned as a result of a user selecting files using the input element, or from a drag and drop operation's DataTransfer object."
    },
    "Blob": {
        "!type": "fn(parts: [?], properties?: ?)",
        "prototype": {
            "size": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
                "!doc": "The size, in bytes, of the data contained in the Blob object. Read only."
            },
            "type": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
                "!doc": "An ASCII-encoded string, in all lower case, indicating the MIME type of the data contained in the Blob. If the type is unknown, this string is empty. Read only."
            },
            "slice": {
                "!type": "fn(start: number, end?: number, type?: string) -> +Blob",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
                "!doc": "Returns a new Blob object containing the data in the specified range of bytes of the source Blob."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
        "!doc": "A Blob object represents a file-like object of immutable, raw data. Blobs represent data that isn't necessarily in a JavaScript-native format. The File interface is based on Blob, inheriting blob functionality and expanding it to support files on the user's system."
    },
    "FileReader": {
        "!type": "fn()",
        "prototype": {
            "abort": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Aborts the read operation. Upon return, the readyState will be DONE."
            },
            "readAsArrayBuffer": {
                "!type": "fn(blob: +Blob)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Starts reading the contents of the specified Blob, producing an ArrayBuffer."
            },
            "readAsBinaryString": {
                "!type": "fn(blob: +Blob)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Starts reading the contents of the specified Blob, producing raw binary data."
            },
            "readAsDataURL": {
                "!type": "fn(blob: +Blob)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Starts reading the contents of the specified Blob, producing a data: url."
            },
            "readAsText": {
                "!type": "fn(blob: +Blob, encoding?: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Starts reading the contents of the specified Blob, producing a string."
            },
            "EMPTY": "number",
            "LOADING": "number",
            "DONE": "number",
            "error": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "The error that occurred while reading the file. Read only."
            },
            "readyState": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Indicates the state of the FileReader. This will be one of the State constants. Read only."
            },
            "result": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "The file's contents. This property is only valid after the read operation is complete, and the format of the data depends on which of the methods was used to initiate the read operation. Read only."
            },
            "onabort": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Called when the read operation is aborted."
            },
            "onerror": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Called when an error occurs."
            },
            "onload": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Called when the read operation is successfully completed."
            },
            "onloadend": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Called when the read is completed, whether successful or not. This is called after either onload or onerror."
            },
            "onloadstart": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Called when reading the data is about to begin."
            },
            "onprogress": {
                "!type": "?",
                "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
                "!doc": "Called periodically while the data is being read."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "The FileReader object lets web applications asynchronously read the contents of files (or raw data buffers) stored on the user's computer, using File or Blob objects to specify the file or data to read. File objects may be obtained from a FileList object returned as a result of a user selecting files using the <input> element, from a drag and drop operation's DataTransfer object, or from the mozGetAsFile() API on an HTMLCanvasElement."
    },
    "URL": {
        "createObjectURL": {
            "!type": "fn(blob: +Blob) -> string",
            "!url": "https://developer.mozilla.org/en-US/docs/Web/API/URL.createObjectURL",
            "!doc": "The URL.createObjectURL() static method creates a DOMString containing an URL representing the object given in parameter."

        },
        "revokeObjectURL": {
            "!type": "fn(string)",
            "!url": "https://developer.mozilla.org/en-US/docs/Web/API/URL.revokeObjectURL",
            "!doc": "The URL.revokeObjectURL() static method releases an existing object URL which was previously created by calling window.URL.createObjectURL()."
        }
    },
    "Range": {
        "!type": "fn()",
        "prototype": {
            "collapsed": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.collapsed",
                "!doc": "Returns a boolean indicating whether the range's start and end points are at the same position."
            },
            "commonAncestorContainer": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.commonAncestorContainer",
                "!doc": "Returns the deepest Node that contains the  startContainer and  endContainer Nodes."
            },
            "endContainer": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.endContainer",
                "!doc": "Returns the Node within which the Range ends."
            },
            "endOffset": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.endOffset",
                "!doc": "Returns a number representing where in the  endContainer the Range ends."
            },
            "startContainer": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.startContainer",
                "!doc": "Returns the Node within which the Range starts."
            },
            "startOffset": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.startOffset",
                "!doc": "Returns a number representing where in the startContainer the Range starts."
            },
            "setStart": {
                "!type": "fn(node: +Element, offset: number)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.setStart",
                "!doc": "Sets the start position of a Range."
            },
            "setEnd": {
                "!type": "fn(node: +Element, offset: number)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.setEnd",
                "!doc": "Sets the end position of a Range."
            },
            "setStartBefore": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.setStartBefore",
                "!doc": "Sets the start position of a Range relative to another Node."
            },
            "setStartAfter": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.setStartAfter",
                "!doc": "Sets the start position of a Range relative to a Node."
            },
            "setEndBefore": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.setEndBefore",
                "!doc": "Sets the end position of a Range relative to another Node."
            },
            "setEndAfter": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.setEndAfter",
                "!doc": "Sets the end position of a Range relative to another Node."
            },
            "selectNode": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.selectNode",
                "!doc": "Sets the Range to contain the Node and its contents."
            },
            "selectNodeContents": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.selectNodeContents",
                "!doc": "Sets the Range to contain the contents of a Node."
            },
            "collapse": {
                "!type": "fn(toStart: bool)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.collapse",
                "!doc": "Collapses the Range to one of its boundary points."
            },
            "cloneContents": {
                "!type": "fn() -> +DocumentFragment",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.cloneContents",
                "!doc": "Returns a DocumentFragment copying the Nodes of a Range."
            },
            "deleteContents": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.deleteContents",
                "!doc": "Removes the contents of a Range from the Document."
            },
            "extractContents": {
                "!type": "fn() -> +DocumentFragment",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.extractContents",
                "!doc": "Moves contents of a Range from the document tree into a DocumentFragment."
            },
            "insertNode": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.insertNode",
                "!doc": "Insert a node at the start of a Range."
            },
            "surroundContents": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.surroundContents",
                "!doc": "Moves content of a Range into a new node, placing the new node at the start of the specified range."
            },
            "compareBoundaryPoints": {
                "!type": "fn(how: number, other: +Range) -> number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.compareBoundaryPoints",
                "!doc": "Compares the boundary points of two Ranges."
            },
            "cloneRange": {
                "!type": "fn() -> +Range",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.cloneRange",
                "!doc": "Returns a Range object with boundary points identical to the cloned Range."
            },
            "detach": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/range.detach",
                "!doc": "Releases a Range from use to improve performance. This lets the browser choose to release resources associated with this Range. Subsequent attempts to use the detached range will result in a DOMException being thrown with an error code of INVALID_STATE_ERR."
            },
            "END_TO_END": "number",
            "END_TO_START": "number",
            "START_TO_END": "number",
            "START_TO_START": "number"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.detach",
        "!doc": "Releases a Range from use to improve performance. This lets the browser choose to release resources associated with this Range. Subsequent attempts to use the detached range will result in a DOMException being thrown with an error code of INVALID_STATE_ERR."
    },
    "XMLHttpRequest": {
        "!type": "fn()",
        "prototype": {
            "abort": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Aborts the request if it has already been sent."
            },
            "getAllResponseHeaders": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Returns all the response headers as a string, or null if no response has been received. Note: For multipart requests, this returns the headers from the current part of the request, not from the original channel."
            },
            "getResponseHeader": {
                "!type": "fn(header: string) -> string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Returns the string containing the text of the specified header, or null if either the response has not yet been received or the header doesn't exist in the response."
            },
            "open": {
                "!type": "fn(method: string, url: string, async?: bool, user?: string, password?: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Initializes a request."
            },
            "overrideMimeType": {
                "!type": "fn(type: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Overrides the MIME type returned by the server."
            },
            "send": {
                "!type": "fn(data?: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Sends the request. If the request is asynchronous (which is the default), this method returns as soon as the request is sent. If the request is synchronous, this method doesn't return until the response has arrived."
            },
            "setRequestHeader": {
                "!type": "fn(header: string, value: string)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Sets the value of an HTTP request header.You must call setRequestHeader() after open(), but before send()."
            },
            "onreadystatechange": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "A JavaScript function object that is called whenever the readyState attribute changes."
            },
            "readyState": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "The state of the request. (0=unsent, 1=opened, 2=headers_received, 3=loading, 4=done)"
            },
            "response": {
                "!type": "+Document",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "The response entity body according to responseType, as an ArrayBuffer, Blob, Document, JavaScript object (for \"json\"), or string. This is null if the request is not complete or was not successful."
            },
            "responseText": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "The response to the request as text, or null if the request was unsuccessful or has not yet been sent."
            },
            "responseType": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "Can be set to change the response type."
            },
            "responseXML": {
                "!type": "+Document",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "The response to the request as a DOM Document object, or null if the request was unsuccessful, has not yet been sent, or cannot be parsed as XML or HTML."
            },
            "status": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "The status of the response to the request. This is the HTTP result code"
            },
            "statusText": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
                "!doc": "The response string returned by the HTTP server. Unlike status, this includes the entire text of the response message (\"200 OK\", for example)."
            },
            "timeout": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest/Synchronous_and_Asynchronous_Requests",
                "!doc": "The number of milliseconds a request can take before automatically being terminated. A value of 0 (which is the default) means there is no timeout."
            },
            "UNSENT": "number",
            "OPENED": "number",
            "HEADERS_RECEIVED": "number",
            "LOADING": "number",
            "DONE": "number"
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "XMLHttpRequest is a JavaScript object that was designed by Microsoft and adopted by Mozilla, Apple, and Google. It's now being standardized in the W3C. It provides an easy way to retrieve data at a URL. Despite its name, XMLHttpRequest can be used to retrieve any type of data, not just XML, and it supports protocols other than HTTP (including file and ftp)."
    },
    "DOMParser": {
        "!type": "fn()",
        "prototype": {
            "parseFromString": {
                "!type": "fn(data: string, mime: string) -> +Document",
                "!url": "https://developer.mozilla.org/en/docs/DOM/DOMParser",
                "!doc": "DOMParser can parse XML or HTML source stored in a string into a DOM Document. DOMParser is specified in DOM Parsing and Serialization."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMParser",
        "!doc": "DOMParser can parse XML or HTML source stored in a string into a DOM Document. DOMParser is specified in DOM Parsing and Serialization."
    },
    "Selection": {
        "!type": "fn()",
        "prototype": {
            "anchorNode": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/anchorNode",
                "!doc": "Returns the node in which the selection begins."
            },
            "anchorOffset": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/anchorOffset",
                "!doc": "Returns the number of characters that the selection's anchor is offset within the anchorNode."
            },
            "focusNode": {
                "!type": "+Element",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/focusNode",
                "!doc": "Returns the node in which the selection ends."
            },
            "focusOffset": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/focusOffset",
                "!doc": "Returns the number of characters that the selection's focus is offset within the focusNode. "
            },
            "isCollapsed": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/isCollapsed",
                "!doc": "Returns a boolean indicating whether the selection's start and end points are at the same position."
            },
            "rangeCount": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/rangeCount",
                "!doc": "Returns the number of ranges in the selection."
            },
            "getRangeAt": {
                "!type": "fn(i: number) -> +Range",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/getRangeAt",
                "!doc": "Returns a range object representing one of the ranges currently selected."
            },
            "collapse": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/collapse",
                "!doc": "Collapses the current selection to a single point. The document is not modified. If the content is focused and editable, the caret will blink there."
            },
            "extend": {
                "!type": "fn(node: +Element, offset: number)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/extend",
                "!doc": "Moves the focus of the selection to a specified point. The anchor of the selection does not move. The selection will be from the anchor to the new focus regardless of direction."
            },
            "collapseToStart": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/collapseToStart",
                "!doc": "Collapses the selection to the start of the first range in the selection.  If the content of the selection is focused and editable, the caret will blink there."
            },
            "collapseToEnd": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/collapseToEnd",
                "!doc": "Collapses the selection to the end of the last range in the selection.  If the content the selection is in is focused and editable, the caret will blink there."
            },
            "selectAllChildren": {
                "!type": "fn(node: +Element)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/selectAllChildren",
                "!doc": "Adds all the children of the specified node to the selection. Previous selection is lost."
            },
            "addRange": {
                "!type": "fn(range: +Range)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/addRange",
                "!doc": "Adds a Range to a Selection."
            },
            "removeRange": {
                "!type": "fn(range: +Range)",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/removeRange",
                "!doc": "Removes a range from the selection."
            },
            "removeAllRanges": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/removeAllRanges",
                "!doc": "Removes all ranges from the selection, leaving the anchorNode and focusNode properties equal to null and leaving nothing selected. "
            },
            "deleteFromDocument": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/deleteFromDocument",
                "!doc": "Deletes the actual text being represented by a selection object from the document's DOM."
            },
            "containsNode": {
                "!type": "fn(node: +Element) -> bool",
                "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/containsNode",
                "!doc": "Indicates if the node is part of the selection."
            }
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection",
        "!doc": "Selection is the class of the object returned by window.getSelection() and other methods. It represents the text selection in the greater page, possibly spanning multiple elements, when the user drags over static text and other parts of the page. For information about text selection in an individual text editing element."
    },
    "console": {
        "error": {
            "!type": "fn(text: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/console.error",
            "!doc": "Outputs an error message to the Web Console."
        },
        "info": {
            "!type": "fn(text: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/console.info",
            "!doc": "Outputs an informational message to the Web Console."
        },
        "log": {
            "!type": "fn(text: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/console.log",
            "!doc": "Outputs a message to the Web Console."
        },
        "warn": {
            "!type": "fn(text: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/console.warn",
            "!doc": "Outputs a warning message to the Web Console."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/console",
        "!doc": "The console object provides access to the browser's debugging console. The specifics of how it works vary from browser to browser, but there is a de facto set of features that are typically provided."
    },
    "top": {
        "!type": "<top>",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.top",
        "!doc": "Returns a reference to the topmost window in the window hierarchy."
    },
    "parent": {
        "!type": "<top>",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.parent",
        "!doc": "A reference to the parent of the current window or subframe."
    },
    "window": {
        "!type": "<top>",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window",
        "!doc": "This section provides a brief reference for all of the methods, properties, and events available through the DOM window object. The window object implements the Window interface, which in turn inherits from the AbstractView interface. Some additional global functions, namespaces objects, and constructors, not typically associated with the window, but available on it, are listed in the JavaScript Reference."
    },
    "opener": {
        "!type": "<top>",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.opener",
        "!doc": "Returns a reference to the window that opened this current window."
    },
    "self": {
        "!type": "<top>",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.self",
        "!doc": "Returns an object reference to the window object. "
    },
    "devicePixelRatio": "number",
    "name": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/JavaScript/Reference/Global_Objects/Function/name",
        "!doc": "The name of the function."
    },
    "closed": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.closed",
        "!doc": "This property indicates whether the referenced window is closed or not."
    },
    "pageYOffset": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollY",
        "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
    },
    "pageXOffset": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollX",
        "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
    },
    "scrollY": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollY",
        "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
    },
    "scrollX": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollX",
        "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
    },
    "screenTop": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.top",
        "!doc": "Returns the distance in pixels from the top side of the current screen."
    },
    "screenLeft": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.left",
        "!doc": "Returns the distance in pixels from the left side of the main screen to the left side of the current screen."
    },
    "screenY": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.screenY",
        "!doc": "Returns the vertical coordinate of the event within the screen as a whole."
    },
    "screenX": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.screenX",
        "!doc": "Returns the horizontal coordinate of the event within the screen as a whole."
    },
    "innerWidth": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.innerWidth",
        "!doc": "Width (in pixels) of the browser window viewport including, if rendered, the vertical scrollbar."
    },
    "innerHeight": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.innerHeight",
        "!doc": "Height (in pixels) of the browser window viewport including, if rendered, the horizontal scrollbar."
    },
    "outerWidth": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.outerWidth",
        "!doc": "window.outerWidth gets the width of the outside of the browser window. It represents the width of the whole browser window including sidebar (if expanded), window chrome and window resizing borders/handles."
    },
    "outerHeight": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.outerHeight",
        "!doc": "window.outerHeight gets the height in pixels of the whole browser window."
    },
    "frameElement": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.frameElement",
        "!doc": "Returns the element (such as <iframe> or <object>) in which the window is embedded, or null if the window is top-level."
    },
    "crypto": {
        "getRandomValues": {
            "!type": "fn([number])",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.crypto.getRandomValues",
            "!doc": "This methods lets you get cryptographically random values."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.crypto.getRandomValues",
        "!doc": "This methods lets you get cryptographically random values."
    },
    "navigator": {
        "appName": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.appName",
            "!doc": "Returns the name of the browser. The HTML5 specification also allows any browser to return \"Netscape\" here, for compatibility reasons."
        },
        "appVersion": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.appVersion",
            "!doc": "Returns the version of the browser as a string. It may be either a plain version number, like \"5.0\", or a version number followed by more detailed information. The HTML5 specification also allows any browser to return \"4.0\" here, for compatibility reasons."
        },
        "language": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.language",
            "!doc": "Returns a string representing the language version of the browser."
        },
        "platform": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.platform",
            "!doc": "Returns a string representing the platform of the browser."
        },
        "plugins": {
            "!type": "[?]",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.plugins",
            "!doc": "Returns a PluginArray object, listing the plugins installed in the application."
        },
        "userAgent": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.userAgent",
            "!doc": "Returns the user agent string for the current browser."
        },
        "vendor": {
            "!type": "string",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.vendor",
            "!doc": "Returns the name of the browser vendor for the current browser."
        },
        "javaEnabled": {
            "!type": "bool",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.javaEnabled",
            "!doc": "This method indicates whether the current browser is Java-enabled or not."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator",
        "!doc": "Returns a reference to the navigator object, which can be queried for information about the application running the script."
    },
    "history": {
        "state": {
            "!type": "?",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
            "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
        },
        "length": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
            "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
        },
        "go": {
            "!type": "fn(delta: number)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.history",
            "!doc": "Returns a reference to the History object, which provides an interface for manipulating the browser session history (pages visited in the tab or frame that the current page is loaded in)."
        },
        "forward": {
            "!type": "fn()",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
            "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
        },
        "back": {
            "!type": "fn()",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
            "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
        },
        "pushState": {
            "!type": "fn(data: ?, title: string, url?: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
            "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
        },
        "replaceState": {
            "!type": "fn(data: ?, title: string, url?: string)",
            "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
            "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
        "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "screen": {
        "availWidth": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availWidth",
            "!doc": "Returns the amount of horizontal space in pixels available to the window."
        },
        "availHeight": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availHeight",
            "!doc": "Returns the amount of vertical space available to the window on the screen."
        },
        "availTop": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availTop",
            "!doc": "Specifies the y-coordinate of the first pixel that is not allocated to permanent or semipermanent user interface features."
        },
        "availLeft": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availLeft",
            "!doc": "Returns the first available pixel available from the left side of the screen."
        },
        "pixelDepth": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.pixelDepth",
            "!doc": "Returns the bit depth of the screen."
        },
        "colorDepth": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.colorDepth",
            "!doc": "Returns the color depth of the screen."
        },
        "width": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.width",
            "!doc": "Returns the width of the screen."
        },
        "height": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.height",
            "!doc": "Returns the height of the screen in pixels."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen",
        "!doc": "Returns a reference to the screen object associated with the window."
    },
    "postMessage": {
        "!type": "fn(message: string, targetOrigin: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.postMessage",
        "!doc": "window.postMessage, when called, causes a MessageEvent to be dispatched at the target window when any pending script that must be executed completes (e.g. remaining event handlers if window.postMessage is called from an event handler, previously-set pending timeouts, etc.). The MessageEvent has the type message, a data property which is set to the value of the first argument provided to window.postMessage, an origin property corresponding to the origin of the main document in the window calling window.postMessage at the time window.postMessage was called, and a source property which is the window from which window.postMessage is called. (Other standard properties of events are present with their expected values.)"
    },
    "close": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.close",
        "!doc": "Closes the current window, or a referenced window."
    },
    "blur": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.blur",
        "!doc": "The blur method removes keyboard focus from the current element."
    },
    "focus": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.focus",
        "!doc": "Sets focus on the specified element, if it can be focused."
    },
    "onload": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onload",
        "!doc": "An event handler for the load event of a window."
    },
    "onunload": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onunload",
        "!doc": "The unload event is raised when the window is unloading its content and resources. The resources removal is processed after the unload event occurs."
    },
    "onscroll": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onscroll",
        "!doc": "Specifies the function to be called when the window is scrolled."
    },
    "onresize": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onresize",
        "!doc": "An event handler for the resize event on the window."
    },
    "ononline": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.ononline",
        "!doc": ",fgh s dgkljgsdfl dfjg sdlgj sdlg sdlfj dlg jkdfkj dfjgdfkglsdfjsdlfkgj hdflkg hdlkfjgh dfkjgh"
    },
    "onoffline": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/Online_and_offline_events",
        "!doc": "Some browsers implement Online/Offline events from the WHATWG Web Applications 1.0 specification."
    },
    "onmousewheel": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOM_event_reference/mousewheel",
        "!doc": "The DOM mousewheel event is fired asynchronously when mouse wheel or similar device is operated. It's represented by the MouseWheelEvent interface."
    },
    "onmouseup": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onmouseup",
        "!doc": "An event handler for the mouseup event on the window."
    },
    "onmouseover": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseover",
        "!doc": "The onmouseover property returns the onMouseOver event handler code on the current element."
    },
    "onmouseout": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseout",
        "!doc": "The onmouseout property returns the onMouseOut event handler code on the current element."
    },
    "onmousemove": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmousemove",
        "!doc": "The onmousemove property returns the mousemove event handler code on the current element."
    },
    "onmousedown": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onmousedown",
        "!doc": "An event handler for the mousedown event on the window."
    },
    "onclick": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onclick",
        "!doc": "The onclick property returns the onClick event handler code on the current element."
    },
    "ondblclick": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.ondblclick",
        "!doc": "The ondblclick property returns the onDblClick event handler code on the current element."
    },
    "onmessage": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
        "!doc": "Dedicated Web Workers provide a simple means for web content to run scripts in background threads.  Once created, a worker can send messages to the spawning task by posting messages to an event handler specified by the creator."
    },
    "onkeyup": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeyup",
        "!doc": "The onkeyup property returns the onKeyUp event handler code for the current element."
    },
    "onkeypress": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeypress",
        "!doc": "The onkeypress property sets and returns the onKeyPress event handler code for the current element."
    },
    "onkeydown": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onkeydown",
        "!doc": "An event handler for the keydown event on the window."
    },
    "oninput": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOM_event_reference/input",
        "!doc": "The DOM input event is fired synchronously when the value of an <input> or <textarea> element is changed. Additionally, it's also fired on contenteditable editors when its contents are changed. In this case, the event target is the editing host element. If there are two or more elements which have contenteditable as true, \"editing host\" is the nearest ancestor element whose parent isn't editable. Similarly, it's also fired on root element of designMode editors."
    },
    "onpopstate": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onpopstate",
        "!doc": "An event handler for the popstate event on the window."
    },
    "onhashchange": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onhashchange",
        "!doc": "The hashchange event fires when a window's hash changes."
    },
    "onfocus": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onfocus",
        "!doc": "The onfocus property returns the onFocus event handler code on the current element."
    },
    "onblur": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onblur",
        "!doc": "The onblur property returns the onBlur event handler code, if any, that exists on the current element."
    },
    "onerror": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onerror",
        "!doc": "An event handler for runtime script errors."
    },
    "ondrop": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/drop",
        "!doc": "The drop event is fired when an element or text selection is dropped on a valid drop target."
    },
    "ondragstart": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragstart",
        "!doc": "The dragstart event is fired when the user starts dragging an element or text selection."
    },
    "ondragover": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragover",
        "!doc": "The dragover event is fired when an element or text selection is being dragged over a valid drop target (every few hundred milliseconds)."
    },
    "ondragleave": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragleave",
        "!doc": "The dragleave event is fired when a dragged element or text selection leaves a valid drop target."
    },
    "ondragenter": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragenter",
        "!doc": "The dragenter event is fired when a dragged element or text selection enters a valid drop target."
    },
    "ondragend": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragend",
        "!doc": "The dragend event is fired when a drag operation is being ended (by releasing a mouse button or hitting the escape key)."
    },
    "ondrag": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/drag",
        "!doc": "The drag event is fired when an element or text selection is being dragged (every few hundred milliseconds)."
    },
    "oncontextmenu": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.oncontextmenu",
        "!doc": "An event handler property for right-click events on the window. Unless the default behavior is prevented, the browser context menu will activate (though IE8 has a bug with this and will not activate the context menu if a contextmenu event handler is defined). Note that this event will occur with any non-disabled right-click event and does not depend on an element possessing the \"contextmenu\" attribute."
    },
    "onchange": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onchange",
        "!doc": "The onchange property sets and returns the onChange event handler code for the current element."
    },
    "onbeforeunload": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onbeforeunload",
        "!doc": "An event that fires when a window is about to unload its resources. The document is still visible and the event is still cancelable."
    },
    "onabort": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onabort",
        "!doc": "An event handler for abort events sent to the window."
    },
    "getSelection": {
        "!type": "fn() -> +Selection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.getSelection",
        "!doc": "Returns a selection object representing the range of text selected by the user. "
    },
    "alert": {
        "!type": "fn(message: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.alert",
        "!doc": "Display an alert dialog with the specified content and an OK button."
    },
    "confirm": {
        "!type": "fn(message: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.confirm",
        "!doc": "Displays a modal dialog with a message and two buttons, OK and Cancel."
    },
    "prompt": {
        "!type": "fn(message: string, value: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.prompt",
        "!doc": "Displays a dialog with a message prompting the user to input some text."
    },
    "scrollBy": {
        "!type": "fn(x: number, y: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollBy",
        "!doc": "Scrolls the document in the window by the given amount."
    },
    "scrollTo": {
        "!type": "fn(x: number, y: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollTo",
        "!doc": "Scrolls to a particular set of coordinates in the document."
    },
    "scroll": {
        "!type": "fn(x: number, y: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scroll",
        "!doc": "Scrolls the window to a particular place in the document."
    },
    "setTimeout": {
        "!type": "fn(f: fn(), ms: number) -> number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.setTimeout",
        "!doc": "Calls a function or executes a code snippet after specified delay."
    },
    "clearTimeout": {
        "!type": "fn(timeout: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.clearTimeout",
        "!doc": "Clears the delay set by window.setTimeout()."
    },
    "setInterval": {
        "!type": "fn(f: fn(), ms: number) -> number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.setInterval",
        "!doc": "Calls a function or executes a code snippet repeatedly, with a fixed time delay between each call to that function."
    },
    "clearInterval": {
        "!type": "fn(interval: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.clearInterval",
        "!doc": "Cancels repeated action which was set up using setInterval."
    },
    "atob": {
        "!type": "fn(encoded: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.atob",
        "!doc": "Decodes a string of data which has been encoded using base-64 encoding."
    },
    "btoa": {
        "!type": "fn(data: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.btoa",
        "!doc": "Creates a base-64 encoded ASCII string from a string of binary data."
    },
    "addEventListener": {
        "!type": "fn(type: string, listener: fn(e: +Event), capture: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.addEventListener",
        "!doc": "Registers a single event listener on a single target. The event target may be a single element in a document, the document itself, a window, or an XMLHttpRequest."
    },
    "removeEventListener": {
        "!type": "fn(type: string, listener: fn(), capture: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.removeEventListener",
        "!doc": "Allows the removal of event listeners from the event target."
    },
    "dispatchEvent": {
        "!type": "fn(event: +Event) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.dispatchEvent",
        "!doc": "Dispatches an event into the event system. The event is subject to the same capturing and bubbling behavior as directly dispatched events."
    },
    "getComputedStyle": {
        "!type": "fn(node: +Element, pseudo?: string) -> Element.prototype.style",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.getComputedStyle",
        "!doc": "Gives the final used values of all the CSS properties of an element."
    },
    "CanvasRenderingContext2D": {
        "canvas": "+Element",
        "width": "number",
        "height": "number",
        "commit": "fn()",
        "save": "fn()",
        "restore": "fn()",
        "currentTransform": "?",
        "scale": "fn(x: number, y: number)",
        "rotate": "fn(angle: number)",
        "translate": "fn(x: number, y: number)",
        "transform": "fn(a: number, b: number, c: number, d: number, e: number, f: number)",
        "setTransform": "fn(a: number, b: number, c: number, d: number, e: number, f: number)",
        "resetTransform": "fn()",
        "globalAlpha": "number",
        "globalCompositeOperation": "string",
        "imageSmoothingEnabled": "bool",
        "strokeStyle": "string",
        "fillStyle": "string",
        "createLinearGradient": "fn(x0: number, y0: number, x1: number, y1: number) -> ?",
        "createPattern": "fn(image: ?, repetition: string) -> ?",
        "shadowOffsetX": "number",
        "shadowOffsetY": "number",
        "shadowBlur": "number",
        "shadowColor": "string",
        "clearRect": "fn(x: number, y: number, w: number, h: number)",
        "fillRect": "fn(x: number, y: number, w: number, h: number)",
        "strokeRect": "fn(x: number, y: number, w: number, h: number)",
        "fillRule": "string",
        "fill": "fn()",
        "beginPath": "fn()",
        "stroke": "fn()",
        "clip": "fn()",
        "resetClip": "fn()",
        "measureText": "fn(text: string) -> ?",
        "drawImage": "fn(image: ?, dx: number, dy: number)",
        "createImageData": "fn(sw: number, sh: number) -> ?",
        "getImageData": "fn(sx: number, sy: number, sw: number, sh: number) -> ?",
        "putImageData": "fn(imagedata: ?, dx: number, dy: number)",
        "lineWidth": "number",
        "lineCap": "string",
        "lineJoin": "string",
        "miterLimit": "number",
        "setLineDash": "fn(segments: [number])",
        "getLineDash": "fn() -> [number]",
        "lineDashOffset": "number",
        "font": "string",
        "textAlign": "string",
        "textBaseline": "string",
        "direction": "string",
        "closePath": "fn()",
        "moveTo": "fn(x: number, y: number)",
        "lineTo": "fn(x: number, y: number)",
        "quadraticCurveTo": "fn(cpx: number, cpy: number, x: number, y: number)",
        "bezierCurveTo": "fn(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number)",
        "arcTo": "fn(x1: number, y1: number, x2: number, y2: number, radius: number)",
        "rect": "fn(x: number, y: number, w: number, h: number)",
        "arc": "fn(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: bool)",
        "ellipse": "fn(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise: bool)"
    }
};


//#endregion


//#region tern/defs/ecma5.json

var def_ecma5 = {
    "!name": "ecma5",
    "!define": { "Error.prototype": "Error.prototype" },
    "Infinity": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Infinity",
        "!doc": "A numeric value representing infinity."
    },
    "undefined": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/undefined",
        "!doc": "The value undefined."
    },
    "NaN": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/NaN",
        "!doc": "A value representing Not-A-Number."
    },
    "Object": {
        "!type": "fn()",
        "getPrototypeOf": {
            "!type": "fn(obj: ?) -> ?",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/getPrototypeOf",
            "!doc": "Returns the prototype (i.e. the internal prototype) of the specified object."
        },
        "create": {
            "!type": "fn(proto: ?) -> !custom:Object_create",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/create",
            "!doc": "Creates a new object with the specified prototype object and properties."
        },
        "defineProperty": {
            "!type": "fn(obj: ?, prop: string, desc: ?)",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/defineProperty",
            "!doc": "Defines a new property directly on an object, or modifies an existing property on an object, and returns the object. If you want to see how to use the Object.defineProperty method with a binary-flags-like syntax, see this article."
        },
        "defineProperties": {
            "!type": "fn(obj: ?, props: ?)",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/defineProperty",
            "!doc": "Defines a new property directly on an object, or modifies an existing property on an object, and returns the object. If you want to see how to use the Object.defineProperty method with a binary-flags-like syntax, see this article."
        },
        "getOwnPropertyDescriptor": {
            "!type": "fn(obj: ?, prop: string) -> ?",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor",
            "!doc": "Returns a property descriptor for an own property (that is, one directly present on an object, not present by dint of being along an object's prototype chain) of a given object."
        },
        "keys": {
            "!type": "fn(obj: ?) -> [string]",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/keys",
            "!doc": "Returns an array of a given object's own enumerable properties, in the same order as that provided by a for-in loop (the difference being that a for-in loop enumerates properties in the prototype chain as well)."
        },
        "getOwnPropertyNames": {
            "!type": "fn(obj: ?) -> [string]",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/getOwnPropertyNames",
            "!doc": "Returns an array of all properties (enumerable or not) found directly upon a given object."
        },
        "seal": {
            "!type": "fn(obj: ?)",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/seal",
            "!doc": "Seals an object, preventing new properties from being added to it and marking all existing properties as non-configurable. Values of present properties can still be changed as long as they are writable."
        },
        "isSealed": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/isSealed",
            "!doc": "Determine if an object is sealed."
        },
        "freeze": {
            "!type": "fn(obj: ?)",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/freeze",
            "!doc": "Freezes an object: that is, prevents new properties from being added to it; prevents existing properties from being removed; and prevents existing properties, or their enumerability, configurability, or writability, from being changed. In essence the object is made effectively immutable. The method returns the object being frozen."
        },
        "isFrozen": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/isFrozen",
            "!doc": "Determine if an object is frozen."
        },
        "prototype": {
            "!stdProto": "Object",
            "toString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/toString",
                "!doc": "Returns a string representing the object."
            },
            "toLocaleString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/toLocaleString",
                "!doc": "Returns a string representing the object. This method is meant to be overriden by derived objects for locale-specific purposes."
            },
            "valueOf": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/valueOf",
                "!doc": "Returns the primitive value of the specified object"
            },
            "hasOwnProperty": {
                "!type": "fn(prop: string) -> bool",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/hasOwnProperty",
                "!doc": "Returns a boolean indicating whether the object has the specified property."
            },
            "propertyIsEnumerable": {
                "!type": "fn(prop: string) -> bool",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/propertyIsEnumerable",
                "!doc": "Returns a Boolean indicating whether the specified property is enumerable."
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object",
        "!doc": "Creates an object wrapper."
    },
    "Function": {
        "!type": "fn(body: string) -> fn()",
        "prototype": {
            "!stdProto": "Function",
            "apply": {
                "!type": "fn(this: ?, args: [?])",
                "!effects": [
                  "call and return !this this=!0 !1.<i> !1.<i> !1.<i>"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/apply",
                "!doc": "Calls a function with a given this value and arguments provided as an array (or an array like object)."
            },
            "call": {
                "!type": "fn(this: ?, args?: ?) -> !this.!ret",
                "!effects": [
                  "call and return !this this=!0 !1 !2 !3 !4"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/call",
                "!doc": "Calls a function with a given this value and arguments provided individually."
            },
            "bind": {
                "!type": "fn(this: ?, args?: ?) -> !custom:Function_bind",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/bind",
                "!doc": "Creates a new function that, when called, has its this keyword set to the provided value, with a given sequence of arguments preceding any provided when the new function was called."
            },
            "prototype": "?"
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function",
        "!doc": "Every function in JavaScript is actually a Function object."
    },
    "Array": {
        "!type": "fn(size: number) -> !custom:Array_ctor",
        "isArray": {
            "!type": "fn(value: ?) -> bool",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/isArray",
            "!doc": "Returns true if an object is an array, false if it is not."
        },
        "prototype": {
            "!stdProto": "Array",
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/length",
                "!doc": "An unsigned, 32-bit integer that specifies the number of elements in an array."
            },
            "concat": {
                "!type": "fn(other: [?]) -> !this",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/concat",
                "!doc": "Returns a new array comprised of this array joined with other array(s) and/or value(s)."
            },
            "join": {
                "!type": "fn(separator?: string) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/join",
                "!doc": "Joins all elements of an array into a string."
            },
            "splice": {
                "!type": "fn(pos: number, amount: number)",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/splice",
                "!doc": "Changes the content of an array, adding new elements while removing old elements."
            },
            "pop": {
                "!type": "fn() -> !this.<i>",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/pop",
                "!doc": "Removes the last element from an array and returns that element."
            },
            "push": {
                "!type": "fn(newelt: ?) -> number",
                "!effects": [
                  "propagate !0 !this.<i>"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/push",
                "!doc": "Mutates an array by appending the given elements and returning the new length of the array."
            },
            "shift": {
                "!type": "fn() -> !this.<i>",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/shift",
                "!doc": "Removes the first element from an array and returns that element. This method changes the length of the array."
            },
            "unshift": {
                "!type": "fn(newelt: ?) -> number",
                "!effects": [
                  "propagate !0 !this.<i>"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/unshift",
                "!doc": "Adds one or more elements to the beginning of an array and returns the new length of the array."
            },
            "slice": {
                "!type": "fn(from: number, to?: number) -> !this",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/slice",
                "!doc": "Returns a shallow copy of a portion of an array."
            },
            "reverse": {
                "!type": "fn()",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/reverse",
                "!doc": "Reverses an array in place.  The first array element becomes the last and the last becomes the first."
            },
            "sort": {
                "!type": "fn(compare?: fn(a: ?, b: ?) -> number)",
                "!effects": [
                  "call !0 !this.<i> !this.<i>"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort",
                "!doc": "Sorts the elements of an array in place and returns the array."
            },
            "indexOf": {
                "!type": "fn(elt: ?, from?: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/indexOf",
                "!doc": "Returns the first index at which a given element can be found in the array, or -1 if it is not present."
            },
            "lastIndexOf": {
                "!type": "fn(elt: ?, from?: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/lastIndexOf",
                "!doc": "Returns the last index at which a given element can be found in the array, or -1 if it is not present. The array is searched backwards, starting at fromIndex."
            },
            "every": {
                "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
                "!effects": [
                  "call !0 this=!1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/every",
                "!doc": "Tests whether all elements in the array pass the test implemented by the provided function."
            },
            "some": {
                "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
                "!effects": [
                  "call !0 this=!1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/some",
                "!doc": "Tests whether some element in the array passes the test implemented by the provided function."
            },
            "filter": {
                "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> !this",
                "!effects": [
                  "call !0 this=!1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/filter",
                "!doc": "Creates a new array with all elements that pass the test implemented by the provided function."
            },
            "forEach": {
                "!type": "fn(f: fn(elt: ?, i: number), context?: ?)",
                "!effects": [
                  "call !0 this=!1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/forEach",
                "!doc": "Executes a provided function once per array element."
            },
            "map": {
                "!type": "fn(f: fn(elt: ?, i: number) -> ?, context?: ?) -> [!0.!ret]",
                "!effects": [
                  "call !0 this=!1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/map",
                "!doc": "Creates a new array with the results of calling a provided function on every element in this array."
            },
            "reduce": {
                "!type": "fn(combine: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?) -> !0.!ret",
                "!effects": [
                  "call !0 !1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/Reduce",
                "!doc": "Apply a function against an accumulator and each value of the array (from left-to-right) as to reduce it to a single value."
            },
            "reduceRight": {
                "!type": "fn(combine: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?) -> !0.!ret",
                "!effects": [
                  "call !0 !1 !this.<i> number"
                ],
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/ReduceRight",
                "!doc": "Apply a function simultaneously against two values of the array (from right-to-left) as to reduce it to a single value."
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array",
        "!doc": "The JavaScript Array global object is a constructor for arrays, which are high-level, list-like objects."
    },
    "String": {
        "!type": "fn(value: ?) -> string",
        "fromCharCode": {
            "!type": "fn(code: number) -> string",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/fromCharCode",
            "!doc": "Returns a string created by using the specified sequence of Unicode values."
        },
        "prototype": {
            "!stdProto": "String",
            "length": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en/docs/JavaScript/Reference/Global_Objects/String/length",
                "!doc": "Represents the length of a string."
            },
            "<i>": "string",
            "charAt": {
                "!type": "fn(i: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/charAt",
                "!doc": "Returns the specified character from a string."
            },
            "charCodeAt": {
                "!type": "fn(i: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/charCodeAt",
                "!doc": "Returns the numeric Unicode value of the character at the given index (except for unicode codepoints > 0x10000)."
            },
            "indexOf": {
                "!type": "fn(char: string, from?: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/indexOf",
                "!doc": "Returns the index within the calling String object of the first occurrence of the specified value, starting the search at fromIndex,\nreturns -1 if the value is not found."
            },
            "lastIndexOf": {
                "!type": "fn(char: string, from?: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/lastIndexOf",
                "!doc": "Returns the index within the calling String object of the last occurrence of the specified value, or -1 if not found. The calling string is searched backward, starting at fromIndex."
            },
            "substring": {
                "!type": "fn(from: number, to?: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/substring",
                "!doc": "Returns a subset of a string between one index and another, or through the end of the string."
            },
            "substr": {
                "!type": "fn(from: number, length?: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/substr",
                "!doc": "Returns the characters in a string beginning at the specified location through the specified number of characters."
            },
            "slice": {
                "!type": "fn(from: number, to?: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/slice",
                "!doc": "Extracts a section of a string and returns a new string."
            },
            "trim": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/Trim",
                "!doc": "Removes whitespace from both ends of the string."
            },
            "trimLeft": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/TrimLeft",
                "!doc": "Removes whitespace from the left end of the string."
            },
            "trimRight": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/TrimRight",
                "!doc": "Removes whitespace from the right end of the string."
            },
            "toUpperCase": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toUpperCase",
                "!doc": "Returns the calling string value converted to uppercase."
            },
            "toLowerCase": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toLowerCase",
                "!doc": "Returns the calling string value converted to lowercase."
            },
            "toLocaleUpperCase": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toLocaleUpperCase",
                "!doc": "Returns the calling string value converted to upper case, according to any locale-specific case mappings."
            },
            "toLocaleLowerCase": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toLocaleLowerCase",
                "!doc": "Returns the calling string value converted to lower case, according to any locale-specific case mappings."
            },
            "split": {
                "!type": "fn(pattern: string) -> [string]",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/split",
                "!doc": "Splits a String object into an array of strings by separating the string into substrings."
            },
            "concat": {
                "!type": "fn(other: string) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/concat",
                "!doc": "Combines the text of two or more strings and returns a new string."
            },
            "localeCompare": {
                "!type": "fn(other: string) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/localeCompare",
                "!doc": "Returns a number indicating whether a reference string comes before or after or is the same as the given string in sort order."
            },
            "match": {
                "!type": "fn(pattern: +RegExp) -> [string]",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/match",
                "!doc": "Used to retrieve the matches when matching a string against a regular expression."
            },
            "replace": {
                "!type": "fn(pattern: +RegExp, replacement: string) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/replace",
                "!doc": "Returns a new string with some or all matches of a pattern replaced by a replacement.  The pattern can be a string or a RegExp, and the replacement can be a string or a function to be called for each match."
            },
            "search": {
                "!type": "fn(pattern: +RegExp) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/search",
                "!doc": "Executes the search for a match between a regular expression and this String object."
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String",
        "!doc": "The String global object is a constructor for strings, or a sequence of characters."
    },
    "Number": {
        "!type": "fn(value: ?) -> number",
        "MAX_VALUE": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/MAX_VALUE",
            "!doc": "The maximum numeric value representable in JavaScript."
        },
        "MIN_VALUE": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/MIN_VALUE",
            "!doc": "The smallest positive numeric value representable in JavaScript."
        },
        "POSITIVE_INFINITY": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/POSITIVE_INFINITY",
            "!doc": "A value representing the positive Infinity value."
        },
        "NEGATIVE_INFINITY": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/NEGATIVE_INFINITY",
            "!doc": "A value representing the negative Infinity value."
        },
        "prototype": {
            "!stdProto": "Number",
            "toString": {
                "!type": "fn(radix?: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toString",
                "!doc": "Returns a string representing the specified Number object"
            },
            "toFixed": {
                "!type": "fn(digits: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed",
                "!doc": "Formats a number using fixed-point notation"
            },
            "toExponential": {
                "!type": "fn(digits: number) -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toExponential",
                "!doc": "Returns a string representing the Number object in exponential notation"
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number",
        "!doc": "The Number JavaScript object is a wrapper object allowing you to work with numerical values. A Number object is created using the Number() constructor."
    },
    "Boolean": {
        "!type": "fn(value: ?) -> bool",
        "prototype": {
            "!stdProto": "Boolean"
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Boolean",
        "!doc": "The Boolean object is an object wrapper for a boolean value."
    },
    "RegExp": {
        "!type": "fn(source: string, flags?: string)",
        "prototype": {
            "!stdProto": "RegExp",
            "exec": {
                "!type": "fn(input: string) -> [string]",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/exec",
                "!doc": "Executes a search for a match in a specified string. Returns a result array, or null."
            },
            "compile": {
                "!type": "fn(source: string, flags?: string)",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
                "!doc": "Creates a regular expression object for matching text with a pattern."
            },
            "test": {
                "!type": "fn(input: string) -> bool",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/test",
                "!doc": "Executes the search for a match between a regular expression and a specified string. Returns true or false."
            },
            "global": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
                "!doc": "Creates a regular expression object for matching text with a pattern."
            },
            "ignoreCase": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
                "!doc": "Creates a regular expression object for matching text with a pattern."
            },
            "multiline": {
                "!type": "bool",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/multiline",
                "!doc": "Reflects whether or not to search in strings across multiple lines.\n"
            },
            "source": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/source",
                "!doc": "A read-only property that contains the text of the pattern, excluding the forward slashes.\n"
            },
            "lastIndex": {
                "!type": "number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/lastIndex",
                "!doc": "A read/write integer property that specifies the index at which to start the next match."
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
        "!doc": "Creates a regular expression object for matching text with a pattern."
    },
    "Date": {
        "!type": "fn(ms: number)",
        "parse": {
            "!type": "fn(source: string) -> +Date",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/parse",
            "!doc": "Parses a string representation of a date, and returns the number of milliseconds since January 1, 1970, 00:00:00 UTC."
        },
        "UTC": {
            "!type": "fn(year: number, month: number, date: number, hour?: number, min?: number, sec?: number, ms?: number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/UTC",
            "!doc": "Accepts the same parameters as the longest form of the constructor, and returns the number of milliseconds in a Date object since January 1, 1970, 00:00:00, universal time."
        },
        "now": {
            "!type": "fn() -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/now",
            "!doc": "Returns the number of milliseconds elapsed since 1 January 1970 00:00:00 UTC."
        },
        "prototype": {
            "toUTCString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toUTCString",
                "!doc": "Converts a date to a string, using the universal time convention."
            },
            "toISOString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toISOString",
                "!doc": "JavaScript provides a direct way to convert a date object into a string in ISO format, the ISO 8601 Extended Format."
            },
            "toDateString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toDateString",
                "!doc": "Returns the date portion of a Date object in human readable form in American English."
            },
            "toTimeString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toTimeString",
                "!doc": "Returns the time portion of a Date object in human readable form in American English."
            },
            "toLocaleDateString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toLocaleDateString",
                "!doc": "Converts a date to a string, returning the \"date\" portion using the operating system's locale's conventions.\n"
            },
            "toLocaleTimeString": {
                "!type": "fn() -> string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toLocaleTimeString",
                "!doc": "Converts a date to a string, returning the \"time\" portion using the current locale's conventions."
            },
            "getTime": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getTime",
                "!doc": "Returns the numeric value corresponding to the time for the specified date according to universal time."
            },
            "getFullYear": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getFullYear",
                "!doc": "Returns the year of the specified date according to local time."
            },
            "getYear": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getYear",
                "!doc": "Returns the year in the specified date according to local time."
            },
            "getMonth": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getMonth",
                "!doc": "Returns the month in the specified date according to local time."
            },
            "getUTCMonth": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCMonth",
                "!doc": "Returns the month of the specified date according to universal time.\n"
            },
            "getDate": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getDate",
                "!doc": "Returns the day of the month for the specified date according to local time."
            },
            "getUTCDate": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCDate",
                "!doc": "Returns the day (date) of the month in the specified date according to universal time.\n"
            },
            "getDay": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getDay",
                "!doc": "Returns the day of the week for the specified date according to local time."
            },
            "getUTCDay": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCDay",
                "!doc": "Returns the day of the week in the specified date according to universal time.\n"
            },
            "getHours": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getHours",
                "!doc": "Returns the hour for the specified date according to local time."
            },
            "getUTCHours": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCHours",
                "!doc": "Returns the hours in the specified date according to universal time.\n"
            },
            "getMinutes": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getMinutes",
                "!doc": "Returns the minutes in the specified date according to local time."
            },
            "getUTCMinutes": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date",
                "!doc": "Creates JavaScript Date instances which let you work with dates and times."
            },
            "getSeconds": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getSeconds",
                "!doc": "Returns the seconds in the specified date according to local time."
            },
            "getUTCSeconds": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCSeconds",
                "!doc": "Returns the seconds in the specified date according to universal time.\n"
            },
            "getMilliseconds": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getMilliseconds",
                "!doc": "Returns the milliseconds in the specified date according to local time."
            },
            "getUTCMilliseconds": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCMilliseconds",
                "!doc": "Returns the milliseconds in the specified date according to universal time.\n"
            },
            "getTimezoneOffset": {
                "!type": "fn() -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset",
                "!doc": "Returns the time-zone offset from UTC, in minutes, for the current locale."
            },
            "setTime": {
                "!type": "fn(date: +Date) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setTime",
                "!doc": "Sets the Date object to the time represented by a number of milliseconds since January 1, 1970, 00:00:00 UTC.\n"
            },
            "setFullYear": {
                "!type": "fn(year: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setFullYear",
                "!doc": "Sets the full year for a specified date according to local time.\n"
            },
            "setUTCFullYear": {
                "!type": "fn(year: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCFullYear",
                "!doc": "Sets the full year for a specified date according to universal time.\n"
            },
            "setMonth": {
                "!type": "fn(month: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setMonth",
                "!doc": "Set the month for a specified date according to local time."
            },
            "setUTCMonth": {
                "!type": "fn(month: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCMonth",
                "!doc": "Sets the month for a specified date according to universal time.\n"
            },
            "setDate": {
                "!type": "fn(day: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setDate",
                "!doc": "Sets the day of the month for a specified date according to local time."
            },
            "setUTCDate": {
                "!type": "fn(day: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCDate",
                "!doc": "Sets the day of the month for a specified date according to universal time.\n"
            },
            "setHours": {
                "!type": "fn(hour: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setHours",
                "!doc": "Sets the hours for a specified date according to local time, and returns the number of milliseconds since 1 January 1970 00:00:00 UTC until the time represented by the updated Date instance."
            },
            "setUTCHours": {
                "!type": "fn(hour: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCHours",
                "!doc": "Sets the hour for a specified date according to universal time.\n"
            },
            "setMinutes": {
                "!type": "fn(min: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setMinutes",
                "!doc": "Sets the minutes for a specified date according to local time."
            },
            "setUTCMinutes": {
                "!type": "fn(min: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCMinutes",
                "!doc": "Sets the minutes for a specified date according to universal time.\n"
            },
            "setSeconds": {
                "!type": "fn(sec: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setSeconds",
                "!doc": "Sets the seconds for a specified date according to local time."
            },
            "setUTCSeconds": {
                "!type": "fn(sec: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCSeconds",
                "!doc": "Sets the seconds for a specified date according to universal time.\n"
            },
            "setMilliseconds": {
                "!type": "fn(ms: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setMilliseconds",
                "!doc": "Sets the milliseconds for a specified date according to local time.\n"
            },
            "setUTCMilliseconds": {
                "!type": "fn(ms: number) -> number",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCMilliseconds",
                "!doc": "Sets the milliseconds for a specified date according to universal time.\n"
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date",
        "!doc": "Creates JavaScript Date instances which let you work with dates and times."
    },
    "Error": {
        "!type": "fn(message: string)",
        "prototype": {
            "name": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Error/name",
                "!doc": "A name for the type of error."
            },
            "message": {
                "!type": "string",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Error/message",
                "!doc": "A human-readable description of the error."
            }
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Error",
        "!doc": "Creates an error object."
    },
    "SyntaxError": {
        "!type": "fn(message: string)",
        "prototype": "Error.prototype",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/SyntaxError",
        "!doc": "Represents an error when trying to interpret syntactically invalid code."
    },
    "ReferenceError": {
        "!type": "fn(message: string)",
        "prototype": "Error.prototype",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/ReferenceError",
        "!doc": "Represents an error when a non-existent variable is referenced."
    },
    "URIError": {
        "!type": "fn(message: string)",
        "prototype": "Error.prototype",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/URIError",
        "!doc": "Represents an error when a malformed URI is encountered."
    },
    "EvalError": {
        "!type": "fn(message: string)",
        "prototype": "Error.prototype",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/EvalError",
        "!doc": "Represents an error regarding the eval function."
    },
    "RangeError": {
        "!type": "fn(message: string)",
        "prototype": "Error.prototype",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RangeError",
        "!doc": "Represents an error when a number is not within the correct range allowed."
    },
    "parseInt": {
        "!type": "fn(string: string, radix?: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/parseInt",
        "!doc": "Parses a string argument and returns an integer of the specified radix or base."
    },
    "parseFloat": {
        "!type": "fn(string: string) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/parseFloat",
        "!doc": "Parses a string argument and returns a floating point number."
    },
    "isNaN": {
        "!type": "fn(value: number) -> bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/isNaN",
        "!doc": "Determines whether a value is NaN or not. Be careful, this function is broken. You may be interested in ECMAScript 6 Number.isNaN."
    },
    "eval": {
        "!type": "fn(code: string) -> ?",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/eval",
        "!doc": "Evaluates JavaScript code represented as a string."
    },
    "encodeURI": {
        "!type": "fn(uri: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/encodeURI",
        "!doc": "Encodes a Uniform Resource Identifier (URI) by replacing each instance of certain characters by one, two, three, or four escape sequences representing the UTF-8 encoding of the character (will only be four escape sequences for characters composed of two \"surrogate\" characters)."
    },
    "encodeURIComponent": {
        "!type": "fn(uri: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/encodeURIComponent",
        "!doc": "Encodes a Uniform Resource Identifier (URI) component by replacing each instance of certain characters by one, two, three, or four escape sequences representing the UTF-8 encoding of the character (will only be four escape sequences for characters composed of two \"surrogate\" characters)."
    },
    "decodeURI": {
        "!type": "fn(uri: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/decodeURI",
        "!doc": "Decodes a Uniform Resource Identifier (URI) previously created by encodeURI or by a similar routine."
    },
    "decodeURIComponent": {
        "!type": "fn(uri: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/decodeURIComponent",
        "!doc": "Decodes a Uniform Resource Identifier (URI) component previously created by encodeURIComponent or by a similar routine."
    },
    "Math": {
        "E": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/E",
            "!doc": "The base of natural logarithms, e, approximately 2.718."
        },
        "LN2": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LN2",
            "!doc": "The natural logarithm of 2, approximately 0.693."
        },
        "LN10": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LN10",
            "!doc": "The natural logarithm of 10, approximately 2.302."
        },
        "LOG2E": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LOG2E",
            "!doc": "The base 2 logarithm of E (approximately 1.442)."
        },
        "LOG10E": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LOG10E",
            "!doc": "The base 10 logarithm of E (approximately 0.434)."
        },
        "SQRT1_2": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/SQRT1_2",
            "!doc": "The square root of 1/2; equivalently, 1 over the square root of 2, approximately 0.707."
        },
        "SQRT2": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/SQRT2",
            "!doc": "The square root of 2, approximately 1.414."
        },
        "PI": {
            "!type": "number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/PI",
            "!doc": "The ratio of the circumference of a circle to its diameter, approximately 3.14159."
        },
        "abs": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/abs",
            "!doc": "Returns the absolute value of a number."
        },
        "cos": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/cos",
            "!doc": "Returns the cosine of a number."
        },
        "sin": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/sin",
            "!doc": "Returns the sine of a number."
        },
        "tan": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/tan",
            "!doc": "Returns the tangent of a number."
        },
        "acos": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/acos",
            "!doc": "Returns the arccosine (in radians) of a number."
        },
        "asin": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/asin",
            "!doc": "Returns the arcsine (in radians) of a number."
        },
        "atan": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/atan",
            "!doc": "Returns the arctangent (in radians) of a number."
        },
        "atan2": {
            "!type": "fn(number, number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/atan2",
            "!doc": "Returns the arctangent of the quotient of its arguments."
        },
        "ceil": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/ceil",
            "!doc": "Returns the smallest integer greater than or equal to a number."
        },
        "floor": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/floor",
            "!doc": "Returns the largest integer less than or equal to a number."
        },
        "round": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/round",
            "!doc": "Returns the value of a number rounded to the nearest integer."
        },
        "exp": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/exp",
            "!doc": "Returns Ex, where x is the argument, and E is Euler's constant, the base of the natural logarithms."
        },
        "log": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/log",
            "!doc": "Returns the natural logarithm (base E) of a number."
        },
        "sqrt": {
            "!type": "fn(number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/sqrt",
            "!doc": "Returns the square root of a number."
        },
        "pow": {
            "!type": "fn(number, number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/pow",
            "!doc": "Returns base to the exponent power, that is, baseexponent."
        },
        "max": {
            "!type": "fn(number, number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/max",
            "!doc": "Returns the largest of zero or more numbers."
        },
        "min": {
            "!type": "fn(number, number) -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/min",
            "!doc": "Returns the smallest of zero or more numbers."
        },
        "random": {
            "!type": "fn() -> number",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/random",
            "!doc": "Returns a floating-point, pseudo-random number in the range [0, 1) that is, from 0 (inclusive) up to but not including 1 (exclusive), which you can then scale to your desired range."
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math",
        "!doc": "A built-in object that has properties and methods for mathematical constants and functions."
    },
    "JSON": {
        "parse": {
            "!type": "fn(json: string) -> ?",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/JSON/parse",
            "!doc": "Parse a string as JSON, optionally transforming the value produced by parsing."
        },
        "stringify": {
            "!type": "fn(value: ?) -> string",
            "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/JSON/stringify",
            "!doc": "Convert a value to JSON, optionally replacing values if a replacer function is specified, or optionally including only the specified properties if a replacer array is specified."
        },
        "!url": "https://developer.mozilla.org/en-US/docs/JSON",
        "!doc": "JSON (JavaScript Object Notation) is a data-interchange format.  It closely resembles a subset of JavaScript syntax, although it is not a strict subset. (See JSON in the JavaScript Reference for full details.)  It is useful when writing any kind of JavaScript-based application, including websites and browser extensions.  For example, you might store user information in JSON format in a cookie, or you might store extension preferences in JSON in a string-valued browser preference."
    }
};

//#endregion


//#region tern/defs/jquery.json

var def_jquery = {
    "!name": "jQuery",
    "!define": {
        "offset": {
            "top": "number",
            "left": "number"
        },
        "keyvalue": {
            "name": "string",
            "value": "string"
        }
    },
    "jQuery": {
        "!type": "fn(selector: string, context?: frameElement) -> jQuery.fn",
        "!url": "http://api.jquery.com/jquery/",
        "!doc": "Return a collection of matched elements either found in the DOM based on passed argument(s) or created by passing an HTML string.",
        "fn": {
            "add": {
                "!type": "fn(selector: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/add/",
                "!doc": "Add elements to the set of matched elements."
            },
            "addBack": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/addBack/",
                "!doc": "Add the previous set of elements on the stack to the current set, optionally filtered by a selector."
            },
            "addClass": {
                "!type": "fn(className: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/addClass/",
                "!doc": "Adds the specified class(es) to each of the set of matched elements."
            },
            "after": {
                "!type": "fn(content: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/after/",
                "!doc": "Insert content, specified by the parameter, after each element in the set of matched elements."
            },
            "ajaxComplete": {
                "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
                "!url": "http://api.jquery.com/ajaxComplete/",
                "!doc": "Register a handler to be called when Ajax requests complete. This is an AjaxEvent."
            },
            "ajaxError": {
                "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
                "!url": "http://api.jquery.com/ajaxError/",
                "!doc": "Register a handler to be called when Ajax requests complete with an error. This is an Ajax Event."
            },
            "ajaxSend": {
                "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
                "!url": "http://api.jquery.com/ajaxSend/",
                "!doc": "Attach a function to be executed before an Ajax request is sent. This is an Ajax Event."
            },
            "ajaxStart": {
                "!type": "fn(handler: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/ajaxStart/",
                "!doc": "Register a handler to be called when the first Ajax request begins. This is an Ajax Event."
            },
            "ajaxStop": {
                "!type": "fn(handler: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/ajaxStop/",
                "!doc": "Register a handler to be called when all Ajax requests have completed. This is an Ajax Event."
            },
            "ajaxSuccess": {
                "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
                "!url": "http://api.jquery.com/ajaxSuccess/",
                "!doc": ""
            },
            "andSelf": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/andSelf/",
                "!doc": "Attach a function to be executed whenever an Ajax request completes successfully. This is an Ajax Event."
            },
            "animate": {
                "!type": "fn(properties: ?, duration?: number, easing?: string, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/animate/",
                "!doc": "Perform a custom animation of a set of CSS properties."
            },
            "append": {
                "!type": "fn(content: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/append/",
                "!doc": "Insert content, specified by the parameter, to the end of each element in the set of matched elements."
            },
            "appendTo": {
                "!type": "fn(target: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/appendTo/",
                "!doc": "Insert every element in the set of matched elements to the end of the target."
            },
            "attr": {
                "!type": "fn(name: string, value?: string) -> string",
                "!url": "http://api.jquery.com/attr/",
                "!doc": "Get the value of an attribute for the first element in the set of matched elements or set one or more attributes for every matched element."
            },
            "before": {
                "!type": "fn(content: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/before/",
                "!doc": "Insert content, specified by the parameter, before each element in the set of matched elements."
            },
            "bind": {
                "!type": "fn(eventType: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/bind/",
                "!doc": "Attach a handler to an event for the elements."
            },
            "blur": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/blur/",
                "!doc": "Bind an event handler to the 'blur' JavaScript event, or trigger that event on an element."
            },
            "change": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/change/",
                "!doc": "Bind an event handler to the 'change' JavaScript event, or trigger that event on an element."
            },
            "children": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/children/",
                "!doc": "Get the children of each element in the set of matched elements, optionally filtered by a selector."
            },
            "click": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/click/",
                "!doc": "Bind an event handler to the 'click' JavaScript event, or trigger that event on an element."
            },
            "clone": {
                "!type": "fn(dataAndEvents?: bool, deep?: bool) -> jQuery.fn",
                "!url": "http://api.jquery.com/clone/",
                "!doc": "Create a deep copy of the set of matched elements."
            },
            "closest": {
                "!type": "fn(selector: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/closest/",
                "!doc": "For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree."
            },
            "contents": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/contents/",
                "!doc": "Get the children of each element in the set of matched elements, including text and comment nodes."
            },
            "context": {
                "!type": "fn() -> +Element",
                "!url": "http://api.jquery.com/context/",
                "!doc": "The DOM node context originally passed to jQuery(); if none was passed then context will likely be the document."
            },
            "css": {
                "!type": "fn(name: string, value?: string) -> string",
                "!url": "http://api.jquery.com/css/",
                "!doc": "Get the value of a style property for the first element in the set of matched elements or set one or more CSS properties for every matched element."
            },
            "data": {
                "!type": "fn(key: string, value?: ?) -> !1",
                "!url": "http://api.jquery.com/data/",
                "!doc": "Store arbitrary data associated with the matched elements or return the value at the named data store for the first element in the set of matched elements."
            },
            "dblclick": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/dblclick/",
                "!doc": "Bind an event handler to the 'dblclick' JavaScript event, or trigger that event on an element."
            },
            "delay": {
                "!type": "fn(duration: number, queue?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/delay/",
                "!doc": "Set a timer to delay execution of subsequent items in the queue."
            },
            "delegate": {
                "!type": "fn(selector: string, eventType: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/delegate/",
                "!doc": "Attach a handler to one or more events for all elements that match the selector, now or in the future, based on a specific set of root elements."
            },
            "dequeue": {
                "!type": "fn(queue?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/dequeue/",
                "!doc": "Execute the next function on the queue for the matched elements."
            },
            "detach": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/detach/",
                "!doc": "Remove the set of matched elements from the DOM."
            },
            "die": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/die/",
                "!doc": "Remove event handlers previously attached using .live() from the elements."
            },
            "each": {
                "!type": "fn(callback: fn(i: number, element: +Element)) -> jQuery.fn",
                "!url": "http://api.jquery.com/each/",
                "!doc": "Iterate over a jQuery object, executing a function for each matched element."
            },
            "empty": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/empty/",
                "!doc": "Remove all child nodes of the set of matched elements from the DOM."
            },
            "end": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/end/",
                "!doc": "End the most recent filtering operation in the current chain and return the set of matched elements to its previous state."
            },
            "eq": {
                "!type": "fn(i: number) -> jQuery.fn",
                "!url": "http://api.jquery.com/eq/",
                "!doc": "Reduce the set of matched elements to the one at the specified index."
            },
            "error": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/error/",
                "!doc": "Bind an event handler to the 'error' JavaScript event."
            },
            "fadeIn": {
                "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/fadeIn/",
                "!doc": "Display the matched elements by fading them to opaque."
            },
            "fadeOut": {
                "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/fadeOut/",
                "!doc": "Hide the matched elements by fading them to transparent."
            },
            "fadeTo": {
                "!type": "fn(duration: number, opacity: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/fadeTo/",
                "!doc": "Adjust the opacity of the matched elements."
            },
            "fadeToggle": {
                "!type": "fn(duration?: number, easing?: string, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/fadeToggle/",
                "!doc": "Display or hide the matched elements by animating their opacity."
            },
            "filter": {
                "!type": "fn(selector: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/filter/",
                "!doc": "Reduce the set of matched elements to those that match the selector or pass the function's test."
            },
            "find": {
                "!type": "fn(selector: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/find/",
                "!doc": "Get the descendants of each element in the current set of matched elements, filtered by a selector, jQuery object, or element."
            },
            "finish": {
                "!type": "fn(queue?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/finish/",
                "!doc": "Stop the currently-running animation, remove all queued animations, and complete all animations for the matched elements."
            },
            "first": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/first/",
                "!doc": "Reduce the set of matched elements to the first in the set."
            },
            "focusin": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/focusin/",
                "!doc": "Bind an event handler to the 'focusin' event."
            },
            "focusout": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/focusout/",
                "!doc": "Bind an event handler to the 'focusout' JavaScript event."
            },
            "get": {
                "!type": "fn(i: number) -> +Element",
                "!url": "http://api.jquery.com/get/",
                "!doc": "Retrieve the DOM elements matched by the jQuery object."
            },
            "has": {
                "!type": "fn(selector: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/has/",
                "!doc": "Reduce the set of matched elements to those that have a descendant that matches the selector or DOM element."
            },
            "hasClass": {
                "!type": "fn(className: string) -> bool",
                "!url": "http://api.jquery.com/hasClass/",
                "!doc": "Determine whether any of the matched elements are assigned the given class."
            },
            "height": {
                "!type": "fn() -> number",
                "!url": "http://api.jquery.com/height/",
                "!doc": "Get the current computed height for the first element in the set of matched elements or set the height of every matched element."
            },
            "hide": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/hide/",
                "!doc": "Hide the matched elements."
            },
            "hover": {
                "!type": "fn(fnOver: fn(+jQuery.Event), fnOut?: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/hover/",
                "!doc": "Bind one or two handlers to the matched elements, to be executed when the mouse pointer enters and leaves the elements."
            },
            "html": {
                "!type": "fn() -> string",
                "!url": "http://api.jquery.com/html/",
                "!doc": "Get the HTML contents of the first element in the set of matched elements or set the HTML contents of every matched element."
            },
            "index": {
                "!type": "fn(selector?: string) -> number",
                "!url": "http://api.jquery.com/index/",
                "!doc": "Search for a given element from among the matched elements."
            },
            "innerHeight": {
                "!type": "fn() -> number",
                "!url": "http://api.jquery.com/innerHeight/",
                "!doc": "Get the current computed height for the first element in the set of matched elements, including padding but not border."
            },
            "innerWidth": {
                "!type": "fn() -> number",
                "!url": "http://api.jquery.com/innerWidth/",
                "!doc": "Get the current computed width for the first element in the set of matched elements, including padding but not border."
            },
            "insertAfter": {
                "!type": "fn(target: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/insertAfter/",
                "!doc": "Insert every element in the set of matched elements after the target."
            },
            "insertBefore": {
                "!type": "fn(target: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/insertBefore/",
                "!doc": "Insert every element in the set of matched elements before the target."
            },
            "is": {
                "!type": "fn(selector: ?) -> bool",
                "!url": "http://api.jquery.com/is/",
                "!doc": "Check the current matched set of elements against a selector, element, or jQuery object and return true if at least one of these elements matches the given arguments."
            },
            "jquery": {
                "!type": "string",
                "!url": "http://api.jquery.com/jquery-2/",
                "!doc": "A string containing the jQuery version number."
            },
            "keydown": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/keydown/",
                "!doc": "Bind an event handler to the 'keydown' JavaScript event, or trigger that event on an element."
            },
            "keypress": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/keypress/",
                "!doc": "Bind an event handler to the 'keypress' JavaScript event, or trigger that event on an element."
            },
            "keyup": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/keyup/",
                "!doc": "Bind an event handler to the 'keyup' JavaScript event, or trigger that event on an element."
            },
            "last": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/last/",
                "!doc": "Reduce the set of matched elements to the final one in the set."
            },
            "length": {
                "!type": "number",
                "!url": "http://api.jquery.com/length/",
                "!doc": "The number of elements in the jQuery object."
            },
            "live": {
                "!type": "fn(selector: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/live/",
                "!doc": "Attach an event handler for all elements which match the current selector, now and in the future."
            },
            "load": {
                "!type": "fn(handler: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/load/",
                "!doc": "Load data from the server and place the returned HTML into the matched element."
            },
            "map": {
                "!type": "fn(callback: fn(i: number, element: +Element)) -> jQuery.fn",
                "!url": "http://api.jquery.com/map/",
                "!doc": "Pass each element in the current matched set through a function, producing a new jQuery object containing the return values."
            },
            "mousedown": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mousedown/",
                "!doc": "Bind an event handler to the 'mousedown' JavaScript event, or trigger that event on an element."
            },
            "mouseenter": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mouseenter/",
                "!doc": "Bind an event handler to be fired when the mouse enters an element, or trigger that handler on an element."
            },
            "mouseleave": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mouseleave/",
                "!doc": "Bind an event handler to be fired when the mouse leaves an element, or trigger that handler on an element."
            },
            "mousemove": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mousemouve/",
                "!doc": "Bind an event handler to the 'mousemove' JavaScript event, or trigger that event on an element."
            },
            "mouseout": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mouseout/",
                "!doc": "Bind an event handler to the 'mouseout' JavaScript event, or trigger that event on an element."
            },
            "mouseover": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mouseover/",
                "!doc": "Bind an event handler to the 'mouseover' JavaScript event, or trigger that event on an element."
            },
            "mouseup": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/mouseup/",
                "!doc": "Bind an event handler to the 'mouseup' JavaScript event, or trigger that event on an element."
            },
            "next": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/next/",
                "!doc": "Get the immediately following sibling of each element in the set of matched elements. If a selector is provided, it retrieves the next sibling only if it matches that selector."
            },
            "nextAll": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/nextAll/",
                "!doc": "Get all following siblings of each element in the set of matched elements, optionally filtered by a selector."
            },
            "nextUntil": {
                "!type": "fn(selector?: string, filter?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/nextUntil/",
                "!doc": "Get all following siblings of each element up to but not including the element matched by the selector, DOM node, or jQuery object passed."
            },
            "not": {
                "!type": "fn(selector: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/not/",
                "!doc": "Remove elements from the set of matched elements."
            },
            "off": {
                "!type": "fn(events: string, selector?: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/off/",
                "!doc": "Remove an event handler."
            },
            "offset": {
                "!type": "fn() -> offset",
                "!url": "http://api.jquery.com/offset/",
                "!doc": "Get the current coordinates of the first element, or set the coordinates of every element, in the set of matched elements, relative to the document."
            },
            "offsetParent": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/offsetParent/",
                "!doc": "Get the closest ancestor element that is positioned."
            },
            "on": {
                "!type": "fn(events: string, selector?: string, data?: ?, handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/on/",
                "!doc": "Attach an event handler function for one or more events to the selected elements."
            },
            "one": {
                "!type": "fn(events: string, data?: ?, handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/one/",
                "!doc": "Attach a handler to an event for the elements. The handler is executed at most once per element."
            },
            "outerHeight": {
                "!type": "fn(includeMargin?: bool) -> number",
                "!url": "http://api.jquery.com/outerHeight/",
                "!doc": "Get the current computed height for the first element in the set of matched elements, including padding, border, and optionally margin. Returns an integer (without 'px') representation of the value or null if called on an empty set of elements."
            },
            "outerWidth": {
                "!type": "fn(includeMargin?: bool) -> number",
                "!url": "http://api.jquery.com/outerWidth/",
                "!doc": "Get the current computed width for the first element in the set of matched elements, including padding and border."
            },
            "parent": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/parent/",
                "!doc": "Get the parent of each element in the current set of matched elements, optionally filtered by a selector."
            },
            "parents": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/parents/",
                "!doc": "Get the ancestors of each element in the current set of matched elements, optionally filtered by a selector."
            },
            "parentsUntil": {
                "!type": "fn(selector?: string, filter?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/parentsUntil/",
                "!doc": "Get the ancestors of each element in the current set of matched elements, up to but not including the element matched by the selector, DOM node, or jQuery object."
            },
            "position": {
                "!type": "fn() -> offset",
                "!url": "http://api.jquery.com/position/",
                "!doc": "Get the current coordinates of the first element in the set of matched elements, relative to the offset parent."
            },
            "prepend": {
                "!type": "fn(content: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/prepend/",
                "!doc": "Insert content, specified by the parameter, to the beginning of each element in the set of matched elements."
            },
            "prependTo": {
                "!type": "fn(target: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/prependTo/",
                "!doc": "Insert every element in the set of matched elements to the beginning of the target."
            },
            "prev": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/prev/",
                "!doc": "Get the immediately preceding sibling of each element in the set of matched elements, optionally filtered by a selector."
            },
            "prevAll": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/prevAll/",
                "!doc": "Get all preceding siblings of each element in the set of matched elements, optionally filtered by a selector."
            },
            "prevUntil": {
                "!type": "fn(selector?: string, filter?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/prevUntil/",
                "!doc": "Get all preceding siblings of each element up to but not including the element matched by the selector, DOM node, or jQuery object."
            },
            "promise": {
                "!type": "fn(type?: string, target: ?) -> +jQuery.Promise",
                "!url": "http://api.jquery.com/promise/",
                "!doc": "Return a Promise object to observe when all actions of a certain type bound to the collection, queued or not, have finished."
            },
            "prop": {
                "!type": "fn(name: string, value?: string) -> string",
                "!url": "http://api.jquery.com/prop/",
                "!doc": "Get the value of a property for the first element in the set of matched elements or set one or more properties for every matched element."
            },
            "pushStack": {
                "!type": "fn(elements: [+Element]) -> jQuery.fn",
                "!url": "http://api.jquery.com/pushStack/",
                "!doc": "Add a collection of DOM elements onto the jQuery stack."
            },
            "queue": {
                "!type": "fn(queue?: string) -> [?]",
                "!url": "http://api.jquery.com/queue/",
                "!doc": "Show or manipulate the queue of functions to be executed on the matched elements."
            },
            "ready": {
                "!type": "fn(fn: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/ready/",
                "!doc": "Specify a function to execute when the DOM is fully loaded."
            },
            "remove": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/remove/",
                "!doc": "Remove the set of matched elements from the DOM."
            },
            "removeAttr": {
                "!type": "fn(attrName: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/removeAttr/",
                "!doc": "Remove an attribute from each element in the set of matched elements."
            },
            "removeClass": {
                "!type": "fn(className?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/removeClass/",
                "!doc": "Remove a single class, multiple classes, or all classes from each element in the set of matched elements."
            },
            "removeData": {
                "!type": "fn(name?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/removeData/",
                "!doc": "Remove a previously-stored piece of data."
            },
            "removeProp": {
                "!type": "fn(propName: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/removeProp/",
                "!doc": "Remove a property for the set of matched elements."
            },
            "replaceAll": {
                "!type": "fn(target: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/replaceAll/",
                "!doc": "Replace each target element with the set of matched elements."
            },
            "replaceWith": {
                "!type": "fn(newContent: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/replaceWith/",
                "!doc": "Replace each element in the set of matched elements with the provided new content and return the set of elements that was removed."
            },
            "resize": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/resize/",
                "!doc": "Bind an event handler to the 'resize' JavaScript event, or trigger that event on an element."
            },
            "scroll": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/scroll/",
                "!doc": "Bind an event handler to the 'scroll' JavaScript event, or trigger that event on an element."
            },
            "scrollLeft": {
                "!type": "number",
                "!url": "http://api.jquery.com/scrollLeft/",
                "!doc": "Get the current horizontal position of the scroll bar for the first element in the set of matched elements or set the horizontal position of the scroll bar for every matched element."
            },
            "scrollTop": {
                "!type": "number",
                "!url": "http://api.jquery.com/scrollTop/",
                "!doc": "Get the current vertical position of the scroll bar for the first element in the set of matched elements or set the vertical position of the scroll bar for every matched element."
            },
            "select": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/select/",
                "!doc": "Bind an event handler to the 'select' JavaScript event, or trigger that event on an element."
            },
            "selector": {
                "!type": "string",
                "!url": "http://api.jquery.com/selector/",
                "!doc": "A selector representing selector passed to jQuery(), if any, when creating the original set."
            },
            "serialize": {
                "!type": "fn() -> string",
                "!url": "http://api.jquery.com/serialize/",
                "!doc": "Encode a set of form elements as a string for submission."
            },
            "serializeArray": {
                "!type": "fn() -> [keyvalue]",
                "!url": "http://api.jquery.com/serializeArray/",
                "!doc": "Encode a set of form elements as an array of names and values."
            },
            "show": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/show/",
                "!doc": "Display the matched elements."
            },
            "siblings": {
                "!type": "fn(selector?: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/siblings/",
                "!doc": "Get the siblings of each element in the set of matched elements, optionally filtered by a selector."
            },
            "size": {
                "!type": "fn() -> number",
                "!url": "http://api.jquery.com/size/",
                "!doc": "Return the number of elements in the jQuery object."
            },
            "slice": {
                "!type": "fn(start: number, end?: number) -> jQuery.fn",
                "!url": "http://api.jquery.com/slice/",
                "!doc": "Reduce the set of matched elements to a subset specified by a range of indices."
            },
            "slideDown": {
                "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/slideDown/",
                "!doc": "Display the matched elements with a sliding motion."
            },
            "slideToggle": {
                "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/slideToggle/",
                "!doc": "Display or hide the matched elements with a sliding motion."
            },
            "slideUp": {
                "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/slideUp/",
                "!doc": "Hide the matched elements with a sliding motion."
            },
            "stop": {
                "!type": "fn(clearQueue?: bool, jumpToEnd?: bool) -> jQuery.fn",
                "!url": "http://api.jquery.com/stop/",
                "!doc": "Stop the currently-running animation on the matched elements."
            },
            "submit": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/submit/",
                "!doc": "Bind an event handler to the 'submit' JavaScript event, or trigger that event on an element."
            },
            "text": {
                "!type": "fn() -> string",
                "!url": "http://api.jquery.com/text/",
                "!doc": "Get the combined text contents of each element in the set of matched elements, including their descendants, or set the text contents of the matched elements."
            },
            "toArray": {
                "!type": "fn() -> [+Element]",
                "!url": "http://api.jquery.com/toArray/",
                "!doc": "Retrieve all the DOM elements contained in the jQuery set, as an array."
            },
            "toggle": {
                "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/toggle/",
                "!doc": "Display or hide the matched elements."
            },
            "toggleClass": {
                "!type": "fn(className: string) -> jQuery.fn",
                "!url": "http://api.jquery.com/toggleClass/",
                "!doc": "Add or remove one or more classes from each element in the set of matched elements, depending on either the class's presence or the value of the switch argument."
            },
            "trigger": {
                "!type": "fn(eventType: string, params: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/trigger/",
                "!doc": "Execute all handlers and behaviors attached to the matched elements for the given event type."
            },
            "triggerHandler": {
                "!type": "fn(eventType: string, params: ?) -> ?",
                "!url": "http://api.jquery.com/triggerHandler/",
                "!doc": "Execute all handlers attached to an element for an event."
            },
            "unbind": {
                "!type": "fn(eventType?: string, handler?: fn()) -> jQuery.fn",
                "!url": "http://api.jquery.com/unbind/",
                "!doc": "Remove a previously-attached event handler from the elements."
            },
            "undelegate": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/undelegate/",
                "!doc": "Remove a handler from the event for all elements which match the current selector, based upon a specific set of root elements."
            },
            "unload": {
                "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
                "!url": "http://api.jquery.com/unload/",
                "!doc": "Bind an event handler to the 'unload' JavaScript event."
            },
            "unwrap": {
                "!type": "fn() -> jQuery.fn",
                "!url": "http://api.jquery.com/unwrap/",
                "!doc": "Remove the parents of the set of matched elements from the DOM, leaving the matched elements in their place."
            },
            "val": {
                "!type": "fn() -> string",
                "!url": "http://api.jquery.com/val/",
                "!doc": "Get the current value of the first element in the set of matched elements or set the value of every matched element."
            },
            "width": {
                "!type": "fn() -> number",
                "!url": "http://api.jquery.com/width/",
                "!doc": "Get the current computed width for the first element in the set of matched elements or set the width of every matched element."
            },
            "wrap": {
                "!type": "fn(wrappingElement: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/wrap/",
                "!doc": "Wrap an HTML structure around each element in the set of matched elements."
            },
            "wrapAll": {
                "!type": "fn(wrappingElement: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/wrapAll/",
                "!doc": "Wrap an HTML structure around all elements in the set of matched elements."
            },
            "wrapInner": {
                "!type": "fn(wrappingElement: ?) -> jQuery.fn",
                "!url": "http://api.jquery.com/wrapInner/",
                "!doc": "Wrap an HTML structure around the content of each element in the set of matched elements."
            },

            "slice": {
                "!type": "fn(start: number, end: number) -> jQuery.fn",
                "!url": "http://api.jquery.com/slice/",
                "!doc": "Reduce the set of matched elements to a subset specified by a range of indices."
            },
            "push": {
                "!type": "Array.prototype.push",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/push",
                "!doc": "Mutates an array by appending the given elements and returning the new length of the array."
            },
            "sort": {
                "!type": "Array.prototype.sort",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort",
                "!doc": "Sorts the elements of an array in place and returns the array."
            },
            "splice": {
                "!type": "Array.prototype.splice",
                "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/splice",
                "!doc": "Changes the content of an array, adding new elements while removing old elements."
            }
        },
        "ajax": {
            "!type": "fn(url: string, settings: ?) -> +jQuery.jqXHR",
            "!url": "http://api.jquery.com/jquery.ajax/",
            "!doc": "Perform an asynchronous HTTP (Ajax) request."
        },
        "ajaxPrefilter": {
            "!type": "fn(dataTypes?: string, handler: fn(options: ?, originalOptions: ?, req: +XMLHttpRequest))",
            "!url": "http://api.jquery.com/jquery.ajaxPrefilter/",
            "!doc": "Handle custom Ajax options or modify existing options before each request is sent and before they are processed by $.ajax()."
        },
        "ajaxSetup": {
            "!type": "fn(options: ?)",
            "!url": "http://api.jquery.com/jquery.ajaxSetup/",
            "!doc": "Set default values for future Ajax requests. Its use is not recommended."
        },
        "ajaxTransport": {
            "!type": "fn(dataType: string, handler: fn(options: ?, originalOptions: ?, req: +XMLHttpRequest))",
            "!url": "http://api.jquery.com/jquery.ajaxTransport/",
            "!doc": "Creates an object that handles the actual transmission of Ajax data."
        },
        "Callbacks": {
            "!type": "fn(flags: string) -> +jQuery.Callbacks",
            "!url": "http://api.jquery.com/jquery.Callbacks/",
            "!doc": "A multi-purpose callbacks list object that provides a powerful way to manage callback lists.",
            "prototype": {
                "add": {
                    "!type": "fn(callbacks: ?) -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.add/",
                    "!doc": "Add a callback or a collection of callbacks to a callback list."
                },
                "disable": {
                    "!type": "fn() -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.disable/",
                    "!doc": "Disable a callback list from doing anything more."
                },
                "disabled": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/callbacks.disabled/",
                    "!doc": "Determine if the callbacks list has been disabled."
                },
                "empty": {
                    "!type": "fn() -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.empty/",
                    "!doc": "Remove all of the callbacks from a list."
                },
                "fire": {
                    "!type": "fn(arguments: ?) -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.fire/",
                    "!doc": "Call all of the callbacks with the given arguments"
                },
                "fired": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/callbacks.fired/",
                    "!doc": "Determine if the callbacks have already been called at least once."
                },
                "fireWith": {
                    "!type": "fn(context?: ?, args?: ?) -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.fireWith/",
                    "!doc": "Call all callbacks in a list with the given context and arguments."
                },
                "has": {
                    "!type": "fn(callback: fn()) -> bool",
                    "!url": "http://api.jquery.com/callbacks.has/",
                    "!doc": "Determine whether a supplied callback is in a list."
                },
                "lock": {
                    "!type": "fn() -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.lock/",
                    "!doc": "Lock a callback list in its current state."
                },
                "locked": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/callbacks.locked/",
                    "!doc": "Determine if the callbacks list has been locked."
                },
                "remove": {
                    "!type": "fn(callbacks: ?) -> +jQuery.Callbacks",
                    "!url": "http://api.jquery.com/callbacks.remove/",
                    "!doc": "Remove a callback or a collection of callbacks from a callback list."
                }
            }
        },
        "contains": {
            "!type": "fn(container: +Element, contained: +Element) -> bool",
            "!url": "http://api.jquery.com/jquery.contains/",
            "!doc": "Check to see if a DOM element is a descendant of another DOM element."
        },
        "cssHooks": {
            "!type": "?",
            "!url": "http://api.jquery.com/cssHooks/",
            "!doc": "Hook directly into jQuery to override how particular CSS properties are retrieved or set, normalize CSS property naming, or create custom properties."
        },
        "data": {
            "!type": "fn(element: +Element, key: string, value: ?) -> !2",
            "!url": "http://api.jquery.com/jquery.data/",
            "!doc": "Store arbitrary data associated with the specified element and/or return the value that was set."
        },
        "Event": {
            "!type": "fn(type: ?, props?: ?) -> +jQuery.Event",
            "!url": "http://api.jquery.com/category/events/event-object/",
            "!doc": "The jQuery.Event constructor is exposed and can be used when calling trigger. The new operator is optional.",
            "prototype": {
                "currentTarget": {
                    "!type": "+Element",
                    "!url": "http://api.jquery.com/event.currentTarget/",
                    "!doc": "The current DOM element within the event bubbling phase."
                },
                "data": {
                    "!type": "?",
                    "!url": "http://api.jquery.com/event.data/",
                    "!doc": "An optional object of data passed to an event method when the current executing handler is bound."
                },
                "delegateTarget": {
                    "!type": "+Element",
                    "!url": "http://api.jquery.com/event.delegateTarget/",
                    "!doc": "The element where the currently-called jQuery event handler was attached."
                },
                "isDefaultPrevented": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/event.isDefaultPrevented/",
                    "!doc": "Returns whether event.preventDefault() was ever called on this event object."
                },
                "isImmediatePropagationStopped": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/event.isImmediatePropagationStopped/",
                    "!doc": "Returns whether event.stopImmediatePropagation() was ever called on this event object."
                },
                "isPropagationStopped": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/event.isPropagationStopped/",
                    "!doc": "Returns whether event.stopPropagation() was ever called on this event object."
                },
                "metaKey": {
                    "!type": "bool",
                    "!url": "http://api.jquery.com/event.metaKey/",
                    "!doc": "Indicates whether the META key was pressed when the event fired."
                },
                "namespace": {
                    "!type": "string",
                    "!url": "http://api.jquery.com/event.namespace/",
                    "!doc": "The namespace specified when the event was triggered."
                },
                "pageX": {
                    "!type": "number",
                    "!url": "http://api.jquery.com/event.pageX/",
                    "!doc": "The mouse position relative to the left edge of the document."
                },
                "pageY": {
                    "!type": "number",
                    "!url": "http://api.jquery.com/event.pageY/",
                    "!doc": "The mouse position relative to the top edge of the document."
                },
                "preventDefault": {
                    "!type": "fn()",
                    "!url": "http://api.jquery.com/event.preventDefault/",
                    "!doc": "If this method is called, the default action of the event will not be triggered."
                },
                "relatedTarget": {
                    "!type": "+Element",
                    "!url": "http://api.jquery.com/event.relatedTarget/",
                    "!doc": "The other DOM element involved in the event, if any."
                },
                "result": {
                    "!type": "?",
                    "!url": "http://api.jquery.com/event.result/",
                    "!doc": "The last value returned by an event handler that was triggered by this event, unless the value was undefined."
                },
                "stopImmediatePropagation": {
                    "!type": "fn()",
                    "!url": "http://api.jquery.com/event.stopImmediatePropagation/",
                    "!doc": "Keeps the rest of the handlers from being executed and prevents the event from bubbling up the DOM tree."
                },
                "stopPropagation": {
                    "!type": "fn()",
                    "!url": "http://api.jquery.com/event.stopPropagation/",
                    "!doc": "Prevents the event from bubbling up the DOM tree, preventing any parent handlers from being notified of the event."
                },
                "target": {
                    "!type": "+Element",
                    "!url": "http://api.jquery.com/event.target/",
                    "!doc": "The DOM element that initiated the event."
                },
                "timeStamp": {
                    "!type": "number",
                    "!url": "http://api.jquery.com/event.timeStamp/",
                    "!doc": "The difference in milliseconds between the time the browser created the event and January 1, 1970."
                },
                "type": {
                    "!type": "string",
                    "!url": "http://api.jquery.com/event.type/",
                    "!doc": "Describes the nature of the event."
                },
                "which": {
                    "!type": "number",
                    "!url": "http://api.jquery.com/event.which/",
                    "!doc": "For key or mouse events, this property indicates the specific key or button that was pressed."
                }
            }
        },
        "Deferred": {
            "!type": "fn(beforeStart?: fn(deferred: +jQuery.Deferred)) -> +jQuery.Deferred",
            "!url": "http://api.jquery.com/jQuery.Deferred/",
            "!doc": "A constructor function that returns a chainable utility object with methods to register multiple callbacks into callback queues, invoke callback queues, and relay the success or failure state of any synchronous or asynchronous function.",
            "prototype": {
                "always": {
                    "!type": "fn(callback: fn()) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.always/",
                    "!doc": "Add handlers to be called when the Deferred object is either resolved or rejected."
                },
                "done": {
                    "!type": "fn(callback: fn()) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.done/",
                    "!doc": "Add handlers to be called when the Deferred object is resolved."
                },
                "fail": {
                    "!type": "fn(callback: fn()) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.fail/",
                    "!doc": "Add handlers to be called when the Deferred object is rejected."
                },
                "isRejected": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/deferred.isRejected/",
                    "!doc": "Determine whether a Deferred object has been rejected."
                },
                "isResolved": {
                    "!type": "fn() -> bool",
                    "!url": "http://api.jquery.com/deferred.isResolved/",
                    "!doc": "Determine whether a Deferred object has been resolved."
                },
                "notify": {
                    "!type": "fn(args?: ?) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.notify/",
                    "!doc": "Call the progressCallbacks on a Deferred object with the given args."
                },
                "notifyWith": {
                    "!type": "fn(context?: ?, args?: ?) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.notifyWith/",
                    "!doc": "Call the progressCallbacks on a Deferred object with the given context and args."
                },
                "pipe": {
                    "!type": "fn(doneFilter?: fn(), failFilter?: fn()) -> +jQuery.Promise",
                    "!url": "http://api.jquery.com/deferred.pipe/",
                    "!doc": "Utility method to filter and/or chain Deferreds."
                },
                "progress": {
                    "!type": "fn(callback: fn()) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.progress/",
                    "!doc": "Add handlers to be called when the Deferred object generates progress notifications."
                },
                "promise": {
                    "!type": "fn(target: ?) -> +jQuery.Promise",
                    "!url": "http://api.jquery.com/deferred.promise/",
                    "!doc": "Return a Deferred's Promise object."
                },
                "reject": {
                    "!type": "fn(args?: ?) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.reject/",
                    "!doc": "Reject a Deferred object and call any failCallbacks with the given args."
                },
                "rejectWith": {
                    "!type": "fn(context?: ?, args?: ?) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.rejectWith/",
                    "!doc": "Reject a Deferred object and call any failCallbacks with the given context and args."
                },
                "resolve": {
                    "!type": "fn(args?: ?) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.resolve/",
                    "!doc": "Resolve a Deferred object and call any doneCallbacks with the given args."
                },
                "resolveWith": {
                    "!type": "fn(context?: ?, args?: ?) -> +jQuery.Deferred",
                    "!url": "http://api.jquery.com/deferred.resolveWith/",
                    "!doc": "Resolve a Deferred object and call any doneCallbacks with the given context and args."
                },
                "state": {
                    "!type": "fn() -> string",
                    "!url": "http://api.jquery.com/deferred.state/",
                    "!doc": "Determine the current state of a Deferred object."
                },
                "then": {
                    "!type": "fn(doneFilter: fn(), failFilter?: fn(), progressFilter?: fn()) -> +jQuery.Promise",
                    "!url": "http://api.jquery.com/deferred.then/",
                    "!doc": "Add handlers to be called when the Deferred object is resolved, rejected, or still in progress."
                }
            }
        },
        "Promise": {
            "!url": "http://api.jquery.com/jQuery.Deferred/",
            "!doc": "A constructor function that returns a chainable utility object with methods to register multiple callbacks into callback queues, invoke callback queues, and relay the success or failure state of any synchronous or asynchronous function.",
            "prototype": {
                "always": "fn(callback: fn()) -> +jQuery.Promise",
                "done": "fn(callback: fn()) -> +jQuery.Promise",
                "fail": "fn(callback: fn()) -> +jQuery.Promise",
                "isRejected": "fn() -> bool",
                "isResolved": "fn() -> bool",
                "pipe": "fn(doneFilter?: fn(), failFilter?: fn()) -> +jQuery.Promise",
                "promise": "fn(target: ?) -> +jQuery.Deferred",
                "state": "fn() -> string",
                "then": "fn(doneFilter: fn(), failFilter?: fn(), progressFilter?: fn()) -> +jQuery.Promise"
            }
        },
        "jqXHR": {
            "prototype": {
                "always": "fn(callback: fn()) -> +jQuery.jqXHR",
                "done": "fn(callback: fn()) -> +jQuery.jqXHR",
                "fail": "fn(callback: fn()) -> +jQuery.jqXHR",
                "isRejected": "fn() -> bool",
                "isResolved": "fn() -> bool",
                "pipe": "fn(doneFilter?: fn(), failFilter?: fn()) -> +jQuery.Promise",
                "promise": "fn(target: ?) -> +jQuery.Promise",
                "state": "fn() -> string",
                "then": "fn(doneFilter: fn(), failFilter?: fn(), progressFilter?: fn()) -> +jQuery.Promise",
                "readyState": "number",
                "status": "number",
                "statusText": "string",
                "resoponseText": "string",
                "resoponseXML": "string",
                "setRequestHeader": "fn(name: string, val: string)",
                "getAllResponseHeader": "fn() ->",
                "getResponseHeader": "fn() ->",
                "statusCode": "fn() -> number",
                "abort": "fn()"
            }
        },
        "dequeue": {
            "!type": "fn(queue?: string) -> jQuery.fn",
            "!url": "http://api.jquery.com/jQuery.dequeue/",
            "!doc": "Execute the next function on the queue for the matched elements."
        },
        "each": {
            "!type": "fn(collection: ?, callback: fn(i: number, elt: ?)) -> !0",
            "!effects": ["call !1 number !0.<i>"],
            "!url": "http://api.jquery.com/jQuery.each/",
            "!doc": "A generic iterator function, which can be used to seamlessly iterate over both objects and arrays. Arrays and array-like objects with a length property (such as a function's arguments object) are iterated by numeric index, from 0 to length-1. Other objects are iterated via their named properties."
        },
        "error": "fn(message: string)",
        "extend": {
            "!type": "fn(target: ?, source: ?) -> !0",
            "!effects": ["copy !1 !0"]
        },
        "fx": {
            "!type": "fn(elem: +Element, options: ?, prop: string, end?: number, easing?: bool)",
            "interval": {
                "!type": "number",
                "!url": "http://api.jquery.com/jquery.fx.interval",
                "!doc": "The rate (in milliseconds) at which animations fire."
            },
            "off": {
                "!type": "bool",
                "!url": "http://api.jquery.com/jquery.fx.off",
                "!doc": "Globally disable all animations."
            },
            "speeds": {
                "slow": "number",
                "fast": "number",
                "_default": "number"
            },
            "stop": "fn()",
            "tick": "fn()",
            "start": "fn()"
        },
        "get": {
            "!type": "fn(url: string, data?: ?, success: fn(data: string, textStatus: string, req: +XMLHttpRequest), dataType?: string) -> +jQuery.jqXHR",
            "!url": "http://api.jquery.com/jquery.get/",
            "!doc": "Load data from the server using a HTTP GET request."
        },
        "getJSON": {
            "!type": "fn(url: string, data?: ?, success: fn(data: ?, textStatus: string, req: +XMLHttpRequest)) -> +jQuery.jqXHR",
            "!url": "http://api.jquery.com/jquery.getJSON/",
            "!doc": "Load JSON-encoded data from the server using a GET HTTP request."
        },
        "getScript": {
            "!type": "fn(url: string, success?: fn(script: string, textStatus: string, req: +XMLHttpRequest)) -> +jQuery.jqXHR",
            "!url": "http://api.jquery.com/jquery.getScript/",
            "!doc": "Load a JavaScript file from the server using a GET HTTP request, then execute it."
        },
        "globalEval": {
            "!type": "fn(code: string)",
            "!url": "http://api.jquery.com/jquery.globalEval/",
            "!doc": "Execute some JavaScript code globally."
        },
        "grep": {
            "!type": "fn(array: [?], filter: fn(elt: ?, i: number), invert?: bool) -> !0",
            "!effects": ["call !1 !0.<i> number"],
            "!url": "http://api.jquery.com/jquery.grep/",
            "!doc": "Finds the elements of an array which satisfy a filter function. The original array is not affected."
        },
        "hasData": {
            "!type": "fn(element: +Element) -> bool",
            "!url": "http://api.jquery.com/jquery.hasData/",
            "!doc": "Determine whether an element has any jQuery data associated with it."
        },
        "holdReady": {
            "!type": "fn(hold: bool)",
            "!url": "http://api.jquery.com/jquery.holdReady/",
            "!doc": "Holds or releases the execution of jQuery's ready event."
        },
        "inArray": {
            "!type": "fn(value: ?, array: [?], from?: number) -> number",
            "!url": "http://api.jquery.com/jquery.inArray/",
            "!doc": "Search for a specified value within an array and return its index (or -1 if not found)."
        },
        "isArray": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isArray/",
            "!doc": "Determine whether the argument is an array."
        },
        "isEmptyObject": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isEmptyObject/",
            "!doc": "Check to see if an object is empty (contains no enumerable properties)."
        },
        "isFunction": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isFunction/",
            "!doc": "Determine if the argument passed is a Javascript function object."
        },
        "isNumeric": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isNumeric/",
            "!doc": "Determines whether its argument is a number."
        },
        "isPlainObject": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isPlainObject/",
            "!doc": "Check to see if an object is a plain object (created using '{}' or 'new Object')."
        },
        "isWindow": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isWindow/",
            "!doc": "Determine whether the argument is a window."
        },
        "isXMLDoc": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isXMLDoc/",
            "!doc": "Check to see if a DOM node is within an XML document (or is an XML document)."
        },
        "isFunction": {
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://api.jquery.com/jquery.isFunction/",
            "!doc": ""
        },
        "makeArray": {
            "!type": "fn(obj: ?) -> [!0.<i>]",
            "!url": "http://api.jquery.com/jquery.makeArray/",
            "!doc": "Convert an array-like object into a true JavaScript array."
        },
        "map": {
            "!type": "fn(array: [?], callback: fn(element: ?, i: number) -> ?) -> [!1.!ret]",
            "!effects": ["call !1 !0.<i> number"],
            "!url": "http://api.jquery.com/jquery.map/",
            "!doc": "Translate all items in an array or object to new array of items."
        },
        "merge": {
            "!type": "fn(first: [?], second: [?]) -> !0",
            "!url": "http://api.jquery.com/jquery.merge/",
            "!doc": "Merge the contents of two arrays together into the first array."
        },
        "noConflict": {
            "!type": "fn(removeAll?: bool) -> jQuery",
            "!url": "http://api.jquery.com/jquery.noConflict/",
            "!doc": "Relinquish jQuery's control of the $ variable."
        },
        "noop": {
            "!type": "fn()",
            "!url": "http://api.jquery.com/jquery.noop/",
            "!doc": "An empty function."
        },
        "now": {
            "!type": "fn() -> number",
            "!url": "http://api.jquery.com/jquery.now/",
            "!doc": "Return a number representing the current time."
        },
        "param": {
            "!type": "fn(obj: ?) -> string",
            "!url": "http://api.jquery.com/jquery.param/",
            "!doc": "Create a serialized representation of an array or object, suitable for use in a URL query string or Ajax request."
        },
        "parseHTML": {
            "!type": "fn(data: string, context?: +Element, keepScripts?: bool) -> [+Element]",
            "!url": "http://api.jquery.com/jquery.parseHTML/",
            "!doc": "Parses a string into an array of DOM nodes."
        },
        "parseJSON": {
            "!type": "fn(json: string) -> ?",
            "!url": "http://api.jquery.com/jquery.parseJSON/",
            "!doc": "Takes a well-formed JSON string and returns the resulting JavaScript object."
        },
        "parseXML": {
            "!type": "fn(xml: string) -> +XMLDocument",
            "!url": "http://api.jquery.com/jquery.parseXML/",
            "!doc": "Parses a string into an XML document."
        },
        "post": {
            "!type": "fn(url: string, data?: ?, success: fn(data: string, textStatus: string, req: +XMLHttpRequest), dataType?: string) -> +jQuery.jqXHR",
            "!url": "http://api.jquery.com/jquery.post/",
            "!doc": "Load data from the server using a HTTP POST request."
        },
        "proxy": {
            "!type": "fn(function: fn(), context: ?) -> fn()",
            "!url": "http://api.jquery.com/jquery.proxy/",
            "!doc": "Takes a function and returns a new one that will always have a particular context."
        },
        "queue": {
            "!type": "fn(element: +Element, queue?: string) -> [?]",
            "!url": "http://api.jquery.com/jquery.queue/",
            "!doc": "Show or manipulate the queue of functions to be executed on the matched element."
        },
        "removeData": {
            "!type": "fn(element: +Element, name?: string)",
            "!url": "http://api.jquery.com/jquery.removeData/",
            "!doc": ""
        },
        "sub": {
            "!type": "fn() -> jQuery",
            "!url": "http://api.jquery.com/jquery.sub/",
            "!doc": "Remove a previously-stored piece of data."
        },
        "support": {
            "!url": "http://api.jquery.com/jquery.support/",
            "!doc": "A collection of properties that represent the presence of different browser features or bugs. Primarily intended for jQuery's internal use; specific properties may be removed when they are no longer needed internally to improve page startup performance.",
            "getSetAttribute": "bool",
            "leadingWhitespace": "bool",
            "tbody": "bool",
            "htmlSerialize": "bool",
            "style": "bool",
            "hrefNormalized": "bool",
            "opacity": "bool",
            "cssFloat": "bool",
            "checkOn": "bool",
            "optSelected": "bool",
            "enctype": "bool",
            "html5Clone": "bool",
            "boxModel": "bool",
            "deleteExpando": "bool",
            "noCloneEvent": "bool",
            "inlineBlockNeedsLayout": "bool",
            "shrinkWrapBlocks": "bool",
            "reliableMarginRight": "bool",
            "boxSizingReliable": "bool",
            "pixelPosition": "bool",
            "noCloneChecked": "bool",
            "optDisabled": "bool",
            "input": "bool",
            "radioValue": "bool",
            "appendChecked": "bool",
            "checkClone": "bool",
            "clearCloneStyle": "bool",
            "reliableHiddenOffsets": "bool",
            "boxSizing": "bool",
            "doesNotIncludeMarginInBodyOffset": "bool",
            "cors": "bool",
            "ajax": "bool"
        },
        "trim": {
            "!type": "fn(str: string) -> string",
            "!url": "http://api.jquery.com/jquery.trim/",
            "!doc": "Remove the whitespace from the beginning and end of a string."
        },
        "type": {
            "!type": "fn(obj: ?) -> string",
            "!url": "http://api.jquery.com/jquery.type/",
            "!doc": "Determine the internal JavaScript [[Class]] of an object."
        },
        "unique": {
            "!type": "fn(array: [?]) -> !0",
            "!url": "http://api.jquery.com/jquery.unique/",
            "!doc": "Sorts an array of DOM elements, in place, with the duplicates removed. Note that this only works on arrays of DOM elements, not strings or numbers."
        },
        "when": {
            "!type": "fn(deferred: +jQuery.Deferred) -> +jQuery.Promise",
            "!url": "http://api.jquery.com/jquery.when/",
            "!doc": "Provides a way to execute callback functions based on one or more objects, usually Deferred objects that represent asynchronous events."
        }
    },
    "$": "jQuery"
};

//#endregion


//#region tern/defs/underscore.json
var def_underscore = {
    "!name": "underscore",
    "_": {
        "!doc": "Save the previous value of the `_` variable.",
        "!type": "fn(obj: ?) -> +_",
        "VERSION": {
            "!type": "string",
            "!url": "http://underscorejs.org/#VERSION"
        },
        "after": {
            "!doc": "Returns a function that will only be executed after being called N times.",
            "!url": "http://underscorejs.org/#after",
            "!type": "fn(times: number, func: fn()) -> !1"
        },
        "all": "_.every",
        "any": "_.some",
        "bind": {
            "!doc": "Create a function bound to a given object (assigning `this`, and arguments, optionally).",
            "!type": "fn(func: ?, context?: ?, args?: ?) -> !0",
            "!url": "http://underscorejs.org/#bind"
        },
        "bindAll": {
            "!doc": "Bind all of an object's methods to that object.",
            "!type": "fn(obj: ?, names?: [string])",
            "!url": "http://underscorejs.org/#bindAll"
        },
        "chain": {
            "!doc": "Add a \"chain\" function, which will delegate to the wrapper.",
            "!type": "fn(obj: ?)",
            "!url": "http://underscorejs.org/#chain"
        },
        "clone": {
            "!doc": "Create a (shallow-cloned) duplicate of an object.",
            "!type": "fn(obj: ?) -> !0",
            "!url": "http://underscorejs.org/#clone"
        },
        "collect": "_.map",
        "compact": {
            "!doc": "Trim out all falsy values from an array.",
            "!type": "fn(array: [?]) -> [?]",
            "!url": "http://underscorejs.org/#compact"
        },
        "compose": {
            "!doc": "Returns a function that is the composition of a list of functions, each consuming the return value of the function that follows.",
            "!type": "fn(a: fn(), b: fn()) -> fn() -> !1.!ret",
            "!url": "http://underscorejs.org/#compose"
        },
        "contains": {
            "!doc": "Determine if the array or object contains a given value (using `===`).",
            "!type": "fn(list: [?], target: ?) -> bool",
            "!url": "http://underscorejs.org/#contains"
        },
        "countBy": {
            "!doc": "Counts instances of an object that group by a certain criterion.",
            "!type": "fn(obj: ?, iterator: fn(elt: ?, i: number) -> ?, context?: ?) -> ?",
            "!url": "http://underscorejs.org/#countBy"
        },
        "debounce": {
            "!doc": "Returns a function, that, as long as it continues to be invoked, will not be triggered.",
            "!type": "fn(func: fn(), wait: number, immediate?: bool) -> !0",
            "!url": "http://underscorejs.org/#debounce"
        },
        "defaults": {
            "!doc": "Fill in a given object with default properties.",
            "!type": "fn(obj: ?, defaults: ?) -> !0",
            "!effects": ["copy !1 !0"],
            "!url": "http://underscorejs.org/#defaults"
        },
        "defer": {
            "!doc": "Defers a function, scheduling it to run after the current call stack has cleared.",
            "!type": "fn(func: fn(), args?: ?) -> number",
            "!url": "http://underscorejs.org/#defer"
        },
        "delay": {
            "!doc": "Delays a function for the given number of milliseconds, and then calls it with the arguments supplied.",
            "!type": "fn(func: fn(), wait: number, args?: ?) -> number",
            "!url": "http://underscorejs.org/#delay"
        },
        "detect": "_.find",
        "difference": {
            "!doc": "Take the difference between one array and a number of other arrays.",
            "!type": "fn(array: [?], others?: [?]) -> !0",
            "!url": "http://underscorejs.org/#difference"
        },
        "drop": "_.rest",
        "each": {
            "!doc": "Iterates over a list of elements, yielding each in turn to an iterator function.",
            "!type": "fn(obj: [?], iterator: fn(value: ?, index: number), context?: ?)",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#each"
        },
        "escape": {
            "!doc": "Escapes a string for insertion into HTML.",
            "!type": "fn(string) -> string",
            "!url": "http://underscorejs.org/#escape"
        },
        "every": {
            "!doc": "Determine whether all of the elements match a truth test.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#every"
        },
        "extend": {
            "!doc": "Extend a given object with all the properties in passed-in object(s).",
            "!type": "fn(destination: ?, source1: ?, source2?: ?) -> !0",
            "!effects": ["copy !1 !0", "copy !2 !0"],
            "!url": "http://underscorejs.org/#extend"
        },
        "filter": {
            "!doc": "Looks through each value in the list, returning an array of all the values that pass a truth test.",
            "!type": "fn(list: [?], test: fn(value: ?, index: number) -> bool, context?: ?) -> !0",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#filter"
        },
        "find": {
            "!doc": "Return the first value which passes a truth test.",
            "!type": "fn(list: [?], test: fn(?) -> bool, context?: ?) -> !0.<i>",
            "!effects": ["call !1 !0.<i>"],
            "!url": "http://underscorejs.org/#find"
        },
        "findWhere": {
            "!doc": "Looks through the list and returns the first value that matches all of the key-value pairs listed in properties.",
            "!type": "fn(list: [?], attrs: ?) -> !0.<i>",
            "!url": "http://underscorejs.org/#findWhere"
        },
        "first": {
            "!doc": "Get the first element of an array. Passing n will return the first N values in the array.",
            "!type": "fn(list: [?], n?: number) -> !0.<i>",
            "!url": "http://underscorejs.org/#first"
        },
        "flatten": {
            "!doc": "Return a completely flattened version of an array.",
            "!type": "fn(array: [?], shallow?: bool) -> [?]",
            "!url": "http://underscorejs.org/#flatten"
        },
        "foldl": "_.reduce",
        "foldr": "_.reduceRight",
        "forEach": "_.each",
        "functions": {
            "!doc": "Return a sorted list of the function names available on the object.",
            "!type": "fn(obj: _) -> [string]",
            "!url": "http://underscorejs.org/#functions"
        },
        "groupBy": {
            "!doc": "Groups the object's values by a criterion.",
            "!type": "fn(obj: [?], iterator: fn(elt: ?, i: number) -> ?, context?: ?) -> ?",
            "!url": "http://underscorejs.org/#groupBy"
        },
        "has": {
            "!doc": "Shortcut function for checking if an object has a given property directly on itself (in other words, not on a prototype).",
            "!type": "fn(obj: ?, key: string) -> bool",
            "!url": "http://underscorejs.org/#has"
        },
        "head": "_.first",
        "identity": {
            "!doc": "Returns the same value that is used as the argument.",
            "!type": "fn(value: ?) -> !0",
            "!url": "http://underscorejs.org/#identity"
        },
        "include": "_.contains",
        "indexOf": {
            "!doc": "Returns the index at which value can be found in the array, or -1 if value is not present in the array.",
            "!type": "fn(list: [?], item: ?, isSorted?: bool) -> number",
            "!url": "http://underscorejs.org/#indexOf"
        },
        "initial": {
            "!doc": "Returns everything but the last entry of the array.",
            "!type": "fn(array: [?], n?: number) -> !0",
            "!url": "http://underscorejs.org/#initial"
        },
        "inject": "_.reduce",
        "intersection": {
            "!doc": "Produce an array that contains every item shared between all the passed-in arrays.",
            "!type": "fn(array: [?], others?: [?]) -> !0",
            "!url": "http://underscorejs.org/#intersection"
        },
        "invert": {
            "!doc": "Invert the keys and values of an object.",
            "!type": "fn(obj: ?) -> ?",
            "!url": "http://underscorejs.org/#invert"
        },
        "invoke": {
            "!doc": "Invoke a method (with arguments) on every item in a collection.",
            "!type": "fn(obj: ?, method: string, args?: ?) -> [?]",
            "!url": "http://underscorejs.org/#invoke"
        },
        "isArguments": {
            "!doc": "Returns true if object is an Arguments object.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isArguments"
        },
        "isArray": {
            "!doc": "Is a given value an array? Delegates to ECMA5's native Array.isArray",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isArray"
        },
        "isBoolean": {
            "!doc": "Is a given value a boolean?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isBoolean"
        },
        "isDate": {
            "!doc": "Returns true if object is a Date object.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isDate"
        },
        "isElement": {
            "!doc": "Is a given value a DOM element?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isElement"
        },
        "isEmpty": {
            "!doc": "Is a given array, string, or object empty? An \"empty\" object has no enumerable own-properties.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isEmpty"
        },
        "isEqual": {
            "!doc": "Perform a deep comparison to check if two objects are equal.",
            "!type": "fn(a: ?, b: ?) -> bool",
            "!url": "http://underscorejs.org/#isEqual"
        },
        "isFinite": {
            "!doc": "Is a given object a finite number?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isFinite"
        },
        "isFunction": {
            "!doc": "Returns true if object is a Function.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isFunction"
        },
        "isNaN": {
            "!doc": "Is the given value `NaN`? (NaN is the only number which does not equal itself).",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isNaN"
        },
        "isNull": {
            "!doc": "Is a given value equal to null?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isNull"
        },
        "isNumber": {
            "!doc": "Returns true if object is a Number (including NaN).",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isNumber"
        },
        "isObject": {
            "!doc": "Is a given variable an object?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isObject"
        },
        "isRegExp": {
            "!doc": "Returns true if object is a regular expression.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isRegExp"
        },
        "isString": {
            "!doc": "Returns true if object is a String.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isString"
        },
        "isUndefined": {
            "!doc": "Is a given variable undefined?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isUndefined"
        },
        "keys": {
            "!doc": "Retrieve the names of an object's properties. Delegates to ECMAScript 5's native `Object.keys`",
            "!type": "fn(obj: ?) -> [string]",
            "!url": "http://underscorejs.org/#keys"
        },
        "last": {
            "!doc": "Get the last element of an array.",
            "!type": "fn(array: [?], n?: number) -> !0.<i>",
            "!url": "http://underscorejs.org/#last"
        },
        "lastIndexOf": {
            "!doc": "Returns the index of the last occurrence of value in the array, or -1 if value is not present.",
            "!type": "fn(array: [?], item: ?, from?: number) -> number",
            "!url": "http://underscorejs.org/#lastIndexOf"
        },
        "map": {
            "!doc": "Produces a new array of values by mapping each value in list through a transformation function (iterator).",
            "!type": "fn(obj: [?], iterator: fn(elt: ?, i: number) -> ?, context?: ?) -> [!1.!ret]",
            "!effects": ["call !1 !this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#map"
        },
        "max": {
            "!doc": "Returns the maximum value in list.",
            "!type": "fn(list: [?], iterator?: fn(elt: ?, i: number) -> number, context?: ?) -> number",
            "!url": "http://underscorejs.org/#max"
        },
        "memoize": {
            "!doc": "Memoize an expensive function by storing its results.",
            "!type": "fn(func: fn(), hasher?: fn(args: ?) -> ?) -> !0",
            "!url": "http://underscorejs.org/#memoize"
        },
        "methods": "_.functions",
        "min": {
            "!doc": "Returns the minimum value in list.",
            "!type": "fn(list: [?], iterator?: fn(elt: ?, i: number) -> number, context?: ?) -> number",
            "!url": "http://underscorejs.org/#min"
        },
        "mixin": {
            "!doc": "Add your own custom functions to the Underscore object.",
            "!type": "fn(obj: _)",
            "!url": "http://underscorejs.org/#mixin"
        },
        "noConflict": {
            "!doc": "Run Underscore.js in *noConflict* mode, returning the `_` variable to its previous owner. Returns a reference to the Underscore object.",
            "!type": "fn() -> _",
            "!url": "http://underscorejs.org/#noConflict"
        },
        "object": {
            "!doc": "Converts lists into objects.",
            "!type": "fn(list: [?], values?: [?]) -> ?",
            "!url": "http://underscorejs.org/#object"
        },
        "omit": {
            "!doc": "Return a copy of the object without the blacklisted properties.",
            "!type": "fn(obj: ?, keys?: string) -> !0",
            "!url": "http://underscorejs.org/#omit"
        },
        "once": {
            "!doc": "Returns a function that will be executed at most one time, no matter how often you call it.",
            "!type": "fn(func: fn() -> ?) -> !0",
            "!url": "http://underscorejs.org/#once"
        },
        "pairs": {
            "!doc": "Convert an object into a list of `[key, value]` pairs.",
            "!type": "fn(obj: ?) -> [[?]]",
            "!url": "http://underscorejs.org/#pairs"
        },
        "partial": {
            "!doc": "Partially apply a function by creating a version that has had some of its arguments pre-filled, without changing its dynamic `this` context.",
            "!type": "fn(func: ?, args?: ?) -> fn()",
            "!url": "http://underscorejs.org/#partial"
        },
        "pick": {
            "!doc": "Return a copy of the object only containing the whitelisted properties.",
            "!type": "fn(obj: ?, keys?: string) -> !0",
            "!url": "http://underscorejs.org/#pick"
        },
        "pluck": {
            "!doc": "Convenience version of a common use case of `map`: fetching a property.",
            "!type": "fn(obj: [?], key: string) -> [?]",
            "!url": "http://underscorejs.org/#pluck"
        },
        "prototype": {
            "chain": {
                "!doc": "Start chaining a wrapped Underscore object.",
                "!type": "fn() -> !this"
            },
            "value": {
                "!doc": "Extracts the result from a wrapped and chained object.",
                "!type": "fn() -> ?"
            },
            "pop": "fn() -> ?",
            "push": "fn(newelt: ?) -> number",
            "reverse": "fn()",
            "shift": "fn() -> ?",
            "sort": "fn() -> !this",
            "splice": "fn(pos: number, amount: number)",
            "unshift": "fn(elt: ?) -> number",
            "concat": "fn(other: ?) -> !this",
            "join": "fn(separator?: string) -> string",
            "slice": "fn(from: number, to?: number) -> !this"
        },
        "random": {
            "!doc": "Return a random integer between min and max (inclusive).",
            "!type": "fn(min: number, max: number) -> number",
            "!url": "http://underscorejs.org/#random"
        },
        "range": {
            "!doc": "A function to create flexibly-numbered lists of integers.",
            "!type": "fn(start?: number, stop: number, step?: number) -> [number]",
            "!url": "http://underscorejs.org/#range"
        },
        "reduce": {
            "!doc": "reduce boils down a list of values into a single value.",
            "!type": "fn(list: [?], iterator: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?, context?: ?) -> !1.!ret",
            "!effects": ["call !1 this=!3 !2 !0.<i> number"],
            "!url": "http://underscorejs.org/#reduce"
        },
        "reduceRight": {
            "!doc": "The right-associative version of reduce, also known as `foldr`.",
            "!type": "fn(list: [?], iterator: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?, context?: ?) -> !1.!ret",
            "!effects": ["call !1 this=!3 !2 !0.<i> number"],
            "!url": "http://underscorejs.org/#reduceRight"
        },
        "reject": {
            "!doc": "Returns the values in list without the elements that the truth test (iterator) passes. The opposite of filter.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> bool, context?: ?) -> !0",
            "!effects": ["call !1 this=!3 !0.<i> number"],
            "!url": "http://underscorejs.org/#reject"
        },
        "rest": {
            "!doc": "Returns the rest of the elements in an array.",
            "!type": "fn(array: [?], n?: number) -> !0",
            "!url": "http://underscorejs.org/#rest"
        },
        "result": {
            "!doc": "If the value of the named `property` is a function then invoke it with the `object` as context; otherwise, return it.",
            "!type": "fn(object: ?, property: string) -> !0.<i>",
            "!url": "http://underscorejs.org/#result"
        },
        "select": "_.filter",
        "shuffle": {
            "!doc": "Shuffle an array.",
            "!type": "fn(list: [?]) -> !0",
            "!url": "http://underscorejs.org/#shuffle"
        },
        "size": {
            "!doc": "Return the number of elements in an object.",
            "!type": "fn(obj: ?) -> number",
            "!url": "http://underscorejs.org/#size"
        },
        "some": {
            "!doc": "Returns true if any of the values in the list pass the iterator truth test.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#some"
        },
        "sortBy": {
            "!doc": "Sort the object's values by a criterion produced by an iterator.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> number, context?: ?) -> !0",
            "!url": "http://underscorejs.org/#sortBy"
        },
        "sortedIndex": {
            "!doc": "Use a comparator function to figure out the smallest index at which an object should be inserted so as to maintain order.",
            "!type": "fn(array: [?], obj: ?, iterator: fn(elt: ?, i: number), context?: ?) -> number",
            "!url": "http://underscorejs.org/#sortedIndex"
        },
        "tail": "_.rest",
        "take": "_.first",
        "tap": {
            "!doc": "Invokes interceptor with the obj, and then returns obj.",
            "!type": "fn(obj: ?, interceptor: fn()) -> !0",
            "!effects": ["call !1 !0"],
            "!url": "http://underscorejs.org/#tap"
        },
        "template": {
            "!doc": "Compiles JavaScript templates into functions that can be evaluated for rendering. ",
            "!type": "fn(text: string, data?: ?, settings?: _.templateSettings) -> fn(data: ?) -> string",
            "!url": "http://underscorejs.org/#template"
        },
        "templateSettings": {
            "!doc": "By default, Underscore uses ERB-style template delimiters, change the following template settings to use alternative delimiters.",
            "escape": "+RegExp",
            "evaluate": "+RegExp",
            "interpolate": "+RegExp",
            "!url": "http://underscorejs.org/#templateSettings"
        },
        "throttle": {
            "!doc": "Returns a function, that, when invoked, will only be triggered at most once during a given window of time.",
            "!type": "fn(func: fn(), wait: number, options?: ?) -> !0",
            "!url": "http://underscorejs.org/#throttle"
        },
        "times": {
            "!doc": "Run a function n times.",
            "!type": "fn(n: number, iterator: fn(), context?: ?) -> [!1.!ret]",
            "!url": "http://underscorejs.org/#times"
        },
        "toArray": {
            "!doc": "Safely create a real, live array from anything iterable.",
            "!type": "fn(obj: ?) -> [?]",
            "!url": "http://underscorejs.org/#toArray"
        },
        "unescape": {
            "!doc": "The opposite of escape.",
            "!type": "fn(string) -> string",
            "!url": "http://underscorejs.org/#unescape"
        },
        "union": {
            "!doc": "Produce an array that contains the union: each distinct element from all of the passed-in arrays.",
            "!type": "fn(array: [?], array2: [?]) -> ?0",
            "!url": "http://underscorejs.org/#union"
        },
        "uniq": {
            "!doc": "Produce a duplicate-free version of the array.",
            "!type": "fn(array: [?], isSorted?: bool, iterator?: fn(elt: ?, i: number), context?: ?) -> [?]",
            "!url": "http://underscorejs.org/#uniq"
        },
        "unique": "_.uniq",
        "uniqueId": {
            "!doc": "Generate a unique integer id (unique within the entire client session). Useful for temporary DOM ids.",
            "!type": "fn(prefix: string) -> string",
            "!url": "http://underscorejs.org/#uniqueId"
        },
        "values": {
            "!doc": "Retrieve the values of an object's properties.",
            "!type": "fn(obj: ?) -> [!0.<i>]",
            "!url": "http://underscorejs.org/#values"
        },
        "where": {
            "!doc": "Looks through each value in the list, returning an array of all the values that contain all of the key-value pairs listed in properties.",
            "!type": "fn(list: [?], attrs: ?) -> !0",
            "!url": "http://underscorejs.org/#where"
        },
        "without": {
            "!doc": "Return a version of the array that does not contain the specified value(s).",
            "!type": "fn(array: [?], values: [?]) -> !0",
            "!url": "http://underscorejs.org/#without"
        },
        "wrap": {
            "!doc": "Returns the first function passed as an argument to the second, allowing you to adjust arguments, run code before and after, and conditionally execute the original function.",
            "!type": "fn(func: fn(), wrapper: fn(?)) -> !0",
            "!effects": ["call !1 !0"],
            "!url": "http://underscorejs.org/#wrap"
        },
        "zip": {
            "!doc": "Zip together multiple lists into a single array -- elements that share an index go together.",
            "!type": "fn(array1: [?], array2: [?]) -> [?]",
            "!url": "http://underscorejs.org/#zip"
        }
    }
};

//#endregion
