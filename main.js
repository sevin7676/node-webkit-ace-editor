/// <reference path="helpers.js" />

if (!window.appLoad) {
    var appconfig = require("./package.json");
    window.appLoad = function(gui) {
        console.log('global debug vars: gui, win (gui.Window.get()), editor, server, loadedFile, fs');
        window.win = gui.Window.get();
        window.gui = gui; //for debugging        
        window.loadedFile = '';

        var ace = window.ace;

        var detectedMode;

        var Range = ace.require("ace/range").Range;
        var jsbeautify = require("./jsbeautify/jsbeautify.js");

        var win = gui.Window.get();
        win.show();
        var fs = require("fs");
        window.fs = fs; //for debugging        
        var Path = require("path");
        if (!window.global.OpenerLoaded) {
            window.global.OpenerLoaded = true;
            gui.App.on("open", function(filename) {
                console.log(filename);
                OpenFileWindow(filename);
            });
        }

        //opens new window 
        function OpenFileWindow(filename) {
            log('filename', filename);
            var win = gui.Window.open('index.html', appconfig.window);
            win.currentFile = filename;
        }

        //#region GetTernRefs
        function loadTernRefs() {
            if (editor.ternServer && editor.ternServer.enabledAtCurrentLocation(editor)) {
                var StringtoCheck = "";
                for (var i = 0; i < editor.session.getLength(); i++) {
                    var thisLine = editor.session.getLine(i);
                    if (thisLine.substr(0, 3) === "///") {
                        StringtoCheck += "\n" + thisLine;
                    }
                    else {
                        break; //only top lines may be references
                    }
                }
                if (StringtoCheck !== '') {
                    var re = /(?!\/\/\/\s*?<reference path=")[^"]*/g;
                    var m;
                    var refs = [];
                    while ((m = re.exec(StringtoCheck)) != null) {
                        if (m.index === re.lastIndex) {
                            re.lastIndex++;
                        }
                        var r = m[0].replace('"', '');
                        if (r.toLowerCase().indexOf('reference path') === -1 && r.trim() !== '' && r.toLowerCase().indexOf('/>') === -1) {
                            if (r.toLowerCase().indexOf('vsdoc') === -1) { //dont load vs doc files as they are visual studio xml junk
                                refs.push(r);
                            }
                        }
                    }
                    //get current path from loaded file
                    var currentPath = '';
                    try {
                        currentPath = window.loadedFile.substring(0, window.loadedFile.lastIndexOf("\\") + 1);
                    }
                    catch (ex) {
                        log('failed to get current file path from: ' + window.loadedFile, ex);
                    }
                    log('refs', refs, 'currentPath', currentPath, 'window.loadedFile', window.loadedFile);

                    //resolves path if needed (if relative)
                    function ResolvePath(path) {
                        var pathPart1 = currentPath;
                        if (path.toLowerCase().indexOf("http") !== -1) {
                            return path;
                        }
                        path = path.replace(new RegExp('/', 'g'), '\\'); //forward to back slashes
                        while (path.substr(0, 3) === '..\\') {
                            var t1 = pathPart1.substr(0, pathPart1.lastIndexOf("\\"));
                            var t2 = t1.substr(0, t1.lastIndexOf("\\"));
                            pathPart1 = t2;
                            path = path.substring(3);
                        }
                        return pathPart1 + "\\" + path;
                    }
                    //reads file and adds to tern
                    function ReadFile_AddToTern(name, path) {
                        if (path.toLowerCase().indexOf("http") !== -1) {
                            var http = require('http');
                            //downloads file and fires callback whend one
                            function downloadFile(url, dest, cb) {
                                var file = fs.createWriteStream(dest);
                                var request = http.get(url, function(response) {
                                    response.pipe(file);
                                    file.on('finish', function() {
                                        file.close(cb);
                                    });
                                });
                            }
                            //generate temp file name
                            var tempFileName = "TEMP_" + Math.random().toString(36).slice(2) + ".js";

                            //download file to temp directory
                            downloadFile(path, tempFileName, function() {
                                //download file complete, now read it and add to tern
                                fs.readFile(tempFileName, function(err, data) {
                                    if (err) {
                                        log('error getting file: ' + path, err);
                                    }
                                    else {
                                        var m = 'adding ' + name + ' to tern (' + path + ')';
                                        log({
                                            stack: false,
                                            time: false
                                        }, m);
                                        statusMsg(m);
                                        editor.ternServer.addDoc(name, data.toString());
                                    }
                                    //now delete the temp file
                                    fs.unlink(tempFileName);
                                });
                            });
                        }
                        else { //local
                            fs.readFile(thisPath, function(err, data) {
                                if (err) {
                                    log('error getting file: ' + path, err);
                                }
                                else {
                                    var m = 'adding ' + name + ' to tern (' + path + ')';
                                    log({
                                        stack: false,
                                        time: false
                                    }, m);
                                    statusMsg(m);
                                    editor.ternServer.addDoc(name, data.toString());
                                }
                            });
                        }
                    }
                    //load each file
                    for (var i = 0; i < refs.length; i++) {
                        var thisPath = ResolvePath(refs[i]);
                        var name = thisPath.replace(/^.*[\\\/]/, '')
                        ReadFile_AddToTern(name, thisPath);
                    }
                }
            }
            else {
                log('tern not enabled at current location');
            }
        }
        //#endregion


        //#region LoadAce
        var editor = ace.edit("editor");
        window.editor = editor; //for debugging      
        editor.getSession().setMode("ace/mode/sql");
        editor.getSession().setUseWrapMode(true);
        editor.getSession().setWrapLimitRange(null, null);
        editor.setShowPrintMargin(false);
        editor.setOption("scrollPastEnd", true);

        //load tern
        ace.config.loadModule('ace/ext/language_tools', function() {
            ace.config.loadModule('ace/ext/tern', function() {
                editor.setOptions({
                    enableTern: true,
                    enableSnippets: true,
                    enableBasicAutocompletion: true
                });
                window.server = ace.require('ace/ext/tern').server;
            });
        });

        //config (ctrl-,)
        var config = ace.require("ace/config");
        config.init();

        //add commands from kitchen sink demo
        editor.commands.addCommands([{
            name: "execute",
            bindKey: "ctrl+enter",
            exec: function(editor) {
                try {
                    var r = window.eval(editor.getCopyText() || editor.getValue());
                }
                catch (e) {
                    r = e;
                }
                editor.cmdLine.setValue(r + "");
            },
            readOnly: true
        }, {
            name: "showKeyboardShortcuts",
            bindKey: {
                win: "Ctrl-Alt-h",
                mac: "Command-Alt-h"
            },
            exec: function(editor) {
                config.loadModule("ace/ext/keybinding_menu", function(module) {
                    module.init(editor);
                    editor.showKeyboardShortcuts();
                });
            }
        }, {
            name: "increaseFontSize",
            bindKey: "Ctrl-=|Ctrl-+",
            exec: function(editor) {
                //var size = parseInt(editor.getFontSize(), 10) || 12;
                // editor.setFontSize(size + 1);
                window.win.zoomLevel++;
                log('increase font size');
            }
        }, {
            name: "decreaseFontSize",
            bindKey: "Ctrl+-|Ctrl-_",
            exec: function(editor) {
                // var size = parseInt(editor.getFontSize(), 10) || 12;
                // editor.setFontSize(Math.max(size - 1 || 1));
                window.win.zoomLevel--;
                log('decrease font size');
            }
        }, {
            name: "resetFontSize",
            bindKey: "Ctrl+0|Ctrl-Numpad0",
            exec: function(editor) {
                // editor.setFontSize(12);
                window.win.zoomLevel = 0;
                log('reset font size');
            }
        }]);

        //add beautify
        editor.commands.addCommand({
            name: 'beautify',
            bindKey: {
                mac: "Command-Shift-B",
                win: "Shift-Ctrl-B"
            },
            exec: function(editor,unselect) {
                //param unselect- if true, then unselect the selection after execution
                var sel = editor.selection;
                var session = editor.session;
                var range = sel.getRange();
                //if nothing is selected, then select all
                var formatAll = false;
                var originalRangeStart = editor.selection.getRange().start;
                if (range.start.row === range.end.row && range.start.column === range.end.column) {
                    //log('originalRangeStart', originalRangeStart);
                    range.start.row = 0;
                    range.start.column = 0;
                    var lastLine = editor.session.getLength() - 1;
                    range.end.row = lastLine;
                    range.end.column = editor.session.getLine(lastLine).length;
                    formatAll = true;
                }

                var options = {};
                options.space_before_conditional = true;
                options.keep_array_indentation = false;
                options.preserve_newlines = true;
                options.unescape_strings = true;
                options.jslint_happy = false;
                options.brace_style = "end-expand";

                if (session.getUseSoftTabs()) {
                    options.indent_char = " ";
                    options.indent_size = session.getTabSize();
                }
                else {
                    options.indent_char = "\t";
                    options.indent_size = 1;
                }

                var line = session.getLine(range.start.row);
                var indent = line.match(/^\s*/)[0];
                var trim = false;

                if (range.start.column < indent.length) range.start.column = 0;
                else trim = true;


                var value = session.getTextRange(range);
                $("[data-mode]").parent().removeClass("active");
                //var syntax = session.syntax;
                var type = null;

                if (detectedMode == "javascript") {
                    type = "js";
                }
                else if (detectedMode == "css") {
                    type = "css";
                }
                if (/^\s*<!?\w/.test(value)) {
                    type = "html";
                }
                else if (detectedMode == "xml") {
                    type = "html";
                }
                else if (detectedMode == "html") {
                    if (/[^<]+?\{[\s\-\w]+:[^}]+;/.test(value)) type = "css";
                    else if (/<\w+[ \/>]/.test(value)) type = "html";
                    else type = "js";
                }

                try {
                    value = jsbeautify[type + "_beautify"](value, options);
                    if (trim) value = value.replace(/^/gm, indent).trim();
                    if (range.end.column === 0) value += "\n" + indent;
                }
                catch (e) {
                    window.alert("Error: This code could not be beautified " + syntax + " is not supported yet");
                    return;
                }

                if (!formatAll) {
                    var end = session.replace(range, value);
                    if(unselect){
                        sel.setSelectionRange(Range.fromPoints(end, end));
                    }
                    else{
                        sel.setSelectionRange(Range.fromPoints(range.start, end));
                    }
                }
                else {
                    //log('set  original', originalRangeStart);
                    session.replace(range, value);
                    sel.setSelectionRange(Range.fromPoints(originalRangeStart, originalRangeStart));
                }

            },
            readOnly: false // false if this command should not apply in readOnly mode
        });

        //add auto beautify
        editor.commands.on('afterExec', function(e) {
            if (e.command.name === "insertstring" && e.args === "}") {
                //ADD-- javascript only
                var pos = editor.getSelectionRange().end;
                var tok = editor.session.getTokenAt(pos.row, pos.column);
                if (tok) {
                    if (tok.type !== 'string' && tok.type.toString().indexOf('comment') ===-1) {
                        editor.jumpToMatching(true); //jumpto and select
                        editor.execCommand('beautify',true);
                    }
                }
            }
            //testing auto beautify
            function getMatching(select) {
                var cursor = editor.getCursorPosition();
                var range = editor.session.getBracketRange(cursor);
                if (!range) {
                    range = editor.find({
                        needle: /[{}()\[\]]/g,
                        preventScroll: true,
                        start: {
                            row: cursor.row,
                            column: cursor.column - 1
                        }
                    });
                    if (!range) return;
                    var pos = range.start;
                    if (pos.row == cursor.row && Math.abs(pos.column - cursor.column) < 2) range = editor.session.getBracketRange(pos);
                }
                pos = range && range.cursor || pos;
                if (pos) {
                    if (select) {
                        if (range && range.isEqual(editor.getSelectionRange())) {
                            editor.clearSelection();
                        }
                        else editor.selection.selectTo(pos.row, pos.column);
                    }
                    else {
                        editor.selection.moveTo(pos.row, pos.column);
                    }
                }
            }
        });
    
        //show token info
        editor.getSession().selection.on('changeCursor', function() {
            try { //throws error if null
                var position = editor.getSelectionRange().start;
                var token = editor.session.getTokenAt(position.row, position.column);
                if (!token) {
                    $('#CurrentToken').html('');
                    return;
                }
                var r = '';
                r += token.type.toString();
                if (token.start) {
                    r += "<span style='padding-left:5px; color:blue;'>start: " + token.start + "</span>";
                }
                if (token.index) {
                    r += "<span style='padding-left:5px; color:blue;'>index: " + token.index + "</span>";
                }
                r += "<span style='padding-left:5px; color:black; font-size:10px;'>Row " + position.row + "</span>";
                r += "<span style='padding-left:5px; color:black; font-size:10px;'>Col " + position.column + "</span>";
                $('#CurrentToken').html(r);
            }
            catch (ex) {
                console.log(ex);
            }
        });


        //#region ThemesAndSyntax
        var theme = window.localStorage.aceTheme || "chrome";
        editor.setTheme("ace/theme/" + theme);
        var editorSession = editor.getSession();
        // name: ["Menu caption", "extensions", "content-type", "hidden|other"]
        var SupportedModes = {
            abap: ["ABAP", "abap", "text/x-abap", "other"],
            asciidoc: ["AsciiDoc", "asciidoc", "text/x-asciidoc", "other"],
            c9search: ["C9Search", "c9search", "text/x-c9search", "hidden"],
            c_cpp: ["C, C++", "c|cc|cpp|cxx|h|hh|hpp", "text/x-c"],
            clojure: ["Clojure", "clj", "text/x-script.clojure"],
            coffee: ["CoffeeScript", "*Cakefile|coffee|cf", "text/x-script.coffeescript"],
            coldfusion: ["ColdFusion", "cfm", "text/x-coldfusion", "other"],
            csharp: ["C#", "cs", "text/x-csharp"],
            css: ["CSS", "css", "text/css"],
            dart: ["Dart", "dart", "text/x-dart"],
            diff: ["Diff", "diff|patch", "text/x-diff", "other"],
            glsl: ["Glsl", "glsl|frag|vert", "text/x-glsl", "other"],
            golang: ["Go", "go", "text/x-go"],
            groovy: ["Groovy", "groovy", "text/x-groovy", "other"],
            haml: ["Haml", "haml", "text/haml", "other"],
            haxe: ["haXe", "hx", "text/haxe", "other"],
            html: ["HTML", "htm|html|xhtml", "text/html"],
            jade: ["Jade", "jade", "text/x-jade"],
            java: ["Java", "java", "text/x-java-source"],
            jsp: ["JSP", "jsp", "text/x-jsp", "other"],
            javascript: ["JavaScript", "js", "application/javascript"],
            json: ["JSON", "json", "application/json"],
            jsx: ["JSX", "jsx", "text/x-jsx", "other"],
            latex: ["LaTeX", "latex|tex|ltx|bib", "application/x-latex", "other"],
            less: ["LESS", "less", "text/x-less"],
            lisp: ["Lisp", "lisp|scm|rkt", "text/x-lisp", "other"],
            liquid: ["Liquid", "liquid", "text/x-liquid", "other"],
            lua: ["Lua", "lua", "text/x-lua"],
            luapage: ["LuaPage", "lp", "text/x-luapage", "other"],
            makefile: ["Makefile", "*GNUmakefile|*makefile|*Makefile|*OCamlMakefile|make", "text/x-makefile", "other"],
            markdown: ["Markdown", "md|markdown", "text/x-markdown", "other"],
            objectivec: ["Objective-C", "m", "text/objective-c", "other"],
            ocaml: ["OCaml", "ml|mli", "text/x-script.ocaml", "other"],
            perl: ["Perl", "pl|pm", "text/x-script.perl"],
            pgsql: ["pgSQL", "pgsql", "text/x-pgsql", "other"],
            php: ["PHP", "php|phtml", "application/x-httpd-php"],
            powershell: ["Powershell", "ps1", "text/x-script.powershell", "other"],
            python: ["Python", "py", "text/x-script.python"],
            r: ["R", "r", "text/x-r", "other"],
            rdoc: ["RDoc", "Rd", "text/x-rdoc", "other"],
            rhtml: ["RHTML", "Rhtml", "text/x-rhtml", "other"],
            ruby: ["Ruby", "ru|gemspec|rake|rb", "text/x-script.ruby"],
            scad: ["OpenSCAD", "scad", "text/x-scad", "other"],
            scala: ["Scala", "scala", "text/x-scala"],
            scss: ["SCSS", "scss|sass", "text/x-scss"],
            sh: ["SH", "sh|bash|bat", "application/x-sh"],
            stylus: ["Stylus", "styl|stylus", "text/x-stylus"],
            sql: ["SQL", "sql", "text/x-sql"],
            svg: ["SVG", "svg", "image/svg+xml", "other"],
            tcl: ["Tcl", "tcl", "text/x-tcl", "other"],
            text: ["Text", "txt", "text/plain", "hidden"],
            textile: ["Textile", "textile", "text/x-web-textile", "other"],
            typescript: ["Typescript", "ts|str", "text/x-typescript"],
            xml: ["XML", "xml|rdf|rss|wsdl|xslt|atom|mathml|mml|xul|xbl", "application/xml"],
            xquery: ["XQuery", "xq", "text/x-xquery"],
            yaml: ["YAML", "yaml", "text/x-yaml"]
        };
        var fileExtensions = {}, ModesCaption = {}, contentTypes = {}, hiddenMode = {}, otherMode = {};
        var syntaxMenuHtml = "";
        Object.keys(SupportedModes).forEach(function(name) {
            var mode = SupportedModes[name];
            mode.caption = mode[0];
            mode.mime = mode[2];
            mode.hidden = mode[3] == "hidden" ? true : false;
            mode.other = mode[3] == "other" ? true : false;
            mode.ext = mode[1];
            mode.ext.split("|").forEach(function(ext) {
                fileExtensions[ext] = name;
            });
            ModesCaption[mode.caption] = name;
            hiddenMode[mode.caption] = mode.hidden;
            otherMode[mode.caption] = mode.other;
            contentTypes[mode.mime] = name;

            syntaxMenuHtml += '<li><a href="#" data-mode="' + name + '">' + mode.caption + '</a></li>';
        });
        $("#syntaxMenu").html(syntaxMenuHtml);
        //#endregion
        
        //#endregion


        //#region FileHandling
        var hasChanged = false;
        var currentFile = win.currentFile ? win.currentFile : process && process._nw_app && fs.existsSync(process._nw_app.argv[0]) ? process._nw_app.argv[0] : null;

        if (win.currentFile) {
            openFile(currentFile);
        }
        else if (process && process._nw_app && fs.existsSync(process._nw_app.argv[0])) {
            try {
                openFile(process._nw_app.argv[0]);
            }
            catch (e) {
                console.log(e);
            }
        }
        else {
            openFile();
        }

        editorSession.on("change", function() {
            if (currentFile) {
                hasChanged = true;
                $("title").text("*" + currentFile);
            }
        });

        $(window).keypress(function(event) {
            if (!(event.which == 115 && event.ctrlKey) && event.which !== 19) return true;
            // event.preventDefault(); //this is likely what was screwing up hotkeys!
            if (!currentFile) return false;
            saveFileFN();
            return false;
        });

        function openFile(path) {
            window.currentFile = path; //set global
            if (hasChanged && !saveFileFN(true)) return false;
            currentFile = null;
            if (path) {
                var fileMode = fileExtensions[Path.basename(path).split(".")[1]];
                if (fileMode) {
                    detectedMode = fileMode;
                    editor.getSession().setMode("ace/mode/" + fileMode);
                }
                hasChanged = false;
                editor.getSession().setValue(fs.readFileSync(path, "utf8"));
                hasChanged = false;
                window.loadedFile = path; //for tern refs
                setTimeout(loadTernRefs, 3000); //load tern refs
            }
            else {
                path = "Untitled";
                editor.getSession().setValue("");
            }
            currentFile = path;
            $("title").text(currentFile);
        }

        function saveasDialog(name) {
            var chooser = $(name);
            chooser.trigger('click');
            chooser.change(function(evt) {
                var saveFilename = $(this).val();
                currentFile = saveFilename;
                hasChanged = true;
                saveFileFN();
            });
        }

        function saveFileFN() {
            if ( /*hasChanged &&*/ currentFile !== "Untitled") {
                var data = editor.getSession().getValue(); //.replace(/\n/g,"\r\n");
                if (currentFile == "Untitled") {
                    saveasDialog('#saveasDialog');
                }
                else {
                    fs.writeFileSync(currentFile, data, "utf8");
                    $("title").text(currentFile);
                    hasChanged = false;
                }
            }
            else {
                saveasDialog('#saveasDialog');
            }
        }

        $("#newFile").click(function() {
            if (confirm("All Changes will be lost?")) {
                openFile();
            }
        });
        $("#openFile").click(function() {
            function chooseFile(name) {
                var chooser = $(name);
                chooser.trigger('click');
                chooser.change(function(evt) {
                    var openFilename = $(this).val();
                    //openFile(openFilename);
                    OpenFileWindow(openFilename);
                });
            }
            chooseFile('#openfileDialog');
        });
        $("#saveFile").click(function() {
            saveFileFN();
        });
        $("#saveasFile").click(function() {
            saveasDialog('#saveasDialog');
        });
        //#endregion


        //#region Theme
        $("[data-theme]").click(function(e) {
            theme = e.target.attributes["data-theme"].value;
            window.localStorage.aceTheme = theme;
            editor.setTheme("ace/theme/" + theme);

            $("[data-theme]").parent().removeClass("active");
            $("[data-theme='" + theme + "']").parent().addClass("active");
        });

        var darkThemes = ['ambiance', 'chaos', 'clouds_midnight', 'cobalt', 'idle_fingers', 'kr_theme', 'merbivore', 'merbivore_soft', 'mono_industrial', 'monokai', 'pastel_on_dark', 'solarized_dark', 'tomorrow_night', 'tomorrow_night_blue', 'tomorrow_night_bright', 'tomorrow_night_eighties', 'twilight', 'vibrant_ink'];

        function isDarkTheme(theme) {
            for (var i in darkThemes) {
                if (darkThemes[i] == theme) return true;
            }
            return false;
        }

        $("[data-theme]").hover(function(e) {
            var ttheme = e.target.attributes["data-theme"].value;
            editor.setTheme("ace/theme/" + ttheme);
            if (isDarkTheme(ttheme)) {
                $(".navbar-static-top").addClass("navbar-inverse");
            }
            else {
                $(".navbar-static-top").removeClass("navbar-inverse");
            }
        }, function() {
            var ttheme = window.localStorage.aceTheme;
            editor.setTheme("ace/theme/" + ttheme);
            if (isDarkTheme(ttheme)) {
                $(".navbar-static-top").addClass("navbar-inverse");
            }
            else {
                $(".navbar-static-top").removeClass("navbar-inverse");
            }
        });

        $("[data-theme]").parent().removeClass("active");
        $("[data-theme='" + theme + "']").parent().addClass("active");
        if (isDarkTheme(theme)) {
            $(".navbar-static-top").addClass("navbar-inverse");
        }
        else {
            $(".navbar-static-top").removeClass("navbar-inverse");
        }
        //#endregion


        //#region Syntax
        $("[data-mode]").click(function(e) {
            var mode = e.target.attributes["data-mode"].value;
            editor.getSession().setMode("ace/mode/" + mode);
            detectedMode = mode;
            $("[data-mode]").parent().removeClass("active");
            $("[data-mode='" + mode + "']").parent().addClass("active");
        });
        $("[data-mode]").hover(function(e) {
            var mode = e.target.attributes["data-mode"].value;
            editor.getSession().setMode("ace/mode/" + mode);
        }, function() {
            editor.getSession().setMode("ace/mode/" + detectedMode);
        });
        $("[data-mode]").parent().removeClass("active");
        $("[data-mode='" + detectedMode + "']").parent().addClass("active");
        win.on('close', function() {
            function disp_confirm() {
                var r = confirm("Press a button!");
                if (r === true) {
                    alert("You pressed OK!");
                }
                else {
                    this.close(true);
                }
            }
            win.close(true);
        });
        $("#windowClose").click(function() {
            win.close();
        });
        //#endregion


        //#region ToolsMenu
        $("[data-cmd]").click(function(e) {
            var cmd = e.target.attributes["data-cmd"].value;
            if (cmd == 'zoom+') {
                window.win.zoomLevel++;
            }
            else if (cmd == 'zoom-') {
                window.win.zoomLevel--;
            }
            else if (cmd == 'zoom0') {
                window.win.zoomLevel = 0;
            }
            else if (cmd == 'devtools') {
                window.win.showDevTools();
            }
            else if (cmd == 'beautify') {
                editor.execCommand('beautify')
            }
            else if (cmd == 'hotkeys') {
                editor.execCommand('showKeyboardShortcuts');
            }
            else if (cmd == 'aceconfig') {
                editor.execCommand('showSettingsMenu')
            }
            else {
                log('cmd=' + cmd);
            }
        });
        //#endregion
    };
}

/**
 * display message on client in bottom right corner
 * @param {string} s - message to display (html or text)
 * @param {bool} [isError=false] - pass true to display red text
 */
function statusMsg(s, isError) {
    if (isError) {
        s = "<span style='color:red;'>" + s + "</span>";
    }
    var el = $('#statusMsg');
    el.html(s);
    el.attr('title', el.text());
}