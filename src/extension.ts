// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, workspace, commands, Disposable, ExtensionContext, ViewColumn, QuickPickOptions} from 'vscode';
import * as fs from 'fs';
import * as pluralize from 'pluralize';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context: ExtensionContext) {

    let fileFinder = new FileFinder();
    let testFileController = new TestFileController(fileFinder);
    console.log("Activated");
    window.showInformationMessage(`Activated Dev Code`);
    let openTestFile = commands.registerCommand('extension.openTestFile', () => {
        fileFinder.openTestFile();
    });

    let openTestFileNew = commands.registerCommand('extension.openTestFileBeside', () => {
        fileFinder.openTestFile(ViewColumn.Beside);
    });

    context.subscriptions.push(testFileController);
    context.subscriptions.push(fileFinder);
    context.subscriptions.push(openTestFile);
    context.subscriptions.push(openTestFileNew);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;

class FileFinder {
    
    testFileNames: string[] = [];
    workspaceRoot: string = "";

    public updateTestFile() {
        
        // Get the current text editor
        let editor = window.activeTextEditor;
        if (!editor || !workspace.workspaceFolders) {
            this.testFileNames = [];
            return;
        }

        this.workspaceRoot = workspace.workspaceFolders[0].uri.path;
        let doc = editor.document;
        
        let filename = "";
        
        if (doc.fileName !== null) { 
            filename = doc.fileName.substring(this.workspaceRoot.length);
            if (filename.startsWith("/")) {
                filename = filename.substr(1);
            }
        }

        if (filename.length === 0) {
            this.testFileNames = [];
        } else {
            this.testFileNames = this.findChangedFiles(filename);
        }
    }

    public openTestFile(column?: ViewColumn) {
        if (column === null) {
            column = ViewColumn.Active;
        }

        if (this.testFileNames.length === 0) {
            window.showInformationMessage('No test files found');
            return;
        }

        if (this.testFileNames.length > 1) {
            let options = <QuickPickOptions>{
                canPickMany: false,
            };
            let displayFileNames = [];
            for (let filename of this.testFileNames) {
                displayFileNames.push(filename.replace(this.workspaceRoot + "/", ''));
            }

            window.showQuickPick(displayFileNames, options).then(selection => {
                if (selection === null) {
                    return;
                }
                workspace.openTextDocument(this.workspaceRoot + "/" + selection).then(doc => {
                    window.showTextDocument(doc, column);
                });
            });
        } else {
            workspace.openTextDocument(this.testFileNames[0]).then(doc => {
                window.showTextDocument(doc, column);
            });
        }
    }

    private findChangedFiles(filename: string): string[] {
        // # when test files change, run them.
        var potential_test_files = new Set();

        var regexp = new RegExp(/^(?:components\/.+\/)?test\/.*_test\.rb$/);
        if (regexp.test(filename)) {
            potential_test_files.add(filename);
        }
        
        // # run unit tests for changes in /lib
        regexp = new RegExp(/^(components\/.+\/)?(?:eager)?lib\/(.*)\.rb$/);
        var matches = regexp.exec(filename);
        if (matches !== null) {
            let component = matches[1];
            if (component === undefined) {
                component = "";
            }
            potential_test_files.add(`${component}test/unit/${matches[2]}_test.rb`);
            potential_test_files.add(`${component}test/unit/lib/${matches[2]}_test.rb`);
        }
        
        // # run functional tests for controllers
        regexp = new RegExp(/^(components\/.+\/)?app\/controllers\/(.*)_controller\.rb$/);
        matches = regexp.exec(filename);
        if (matches !== null) {
            let component = matches[1];
            if (component === undefined) {
                component = "";
            }
            potential_test_files.add(`${component}test/controllers/${matches[2]}_controller_test.rb`);
        }

        // # for models, run the unit tests, and functional tests for the related controller(s).
        regexp = new RegExp(/^(components\/.+\/)?app\/models\/(.*)\.rb$/);
        matches = regexp.exec(filename);
        if (matches !== null) {
            let component = matches[1];
            if (component === undefined) {
                component = "";
            }

            potential_test_files.add(`${component}test/controllers/${matches[2]}_controller_test.rb`);
        }
        
        regexp = new RegExp(/^(components\/.+\/)?app\/models\/(.*)\.rb$/);
        matches = regexp.exec(filename);
        if (matches !== null) {
            let component = matches[1];
            if (component === undefined) {
                component = "";
            }
            let model = matches[2];
            let models = pluralize.plural(model);
            
            potential_test_files.add(`${component}test/models/${model}_test.rb`);
            potential_test_files.add(`${component}test/unit/${model}_test.rb`);
            potential_test_files.add(`${component}test/controllers/${models}_controller_test.rb`);
            potential_test_files.add(`${component}test/controllers/admin/${models}_controller_test.rb`);
            potential_test_files.add(`${component}test/controllers/api/${models}_controller_test.rb`);
        }
    
        // # run unit tests for changes in /app
        regexp = new RegExp(/^(components\/.+\/)?app\/(\w+)\/(.*)\.rb$/);
        matches = regexp.exec(filename);
        if (matches !== null) {
            let component = matches[1];
            if (component === undefined) {
                component = "";
            }
            potential_test_files.add(`${component}test/unit/${matches[2]}/${matches[3]}_test.rb`);
            let subfolder = matches[3].split('/');
            potential_test_files.add(`${component}test/unit/${subfolder[0]}/${subfolder[subfolder.length - 1]}_test.rb`);
        }

        // # run unit tests for changes in db/migrate/migrate
        regexp = new RegExp(/^db\/maintenance\/maintenance\/(.*)\.rb$/);
        matches = regexp.exec(filename);
        if (matches !== null) {
            let model = matches[1];
            potential_test_files.add(`test/unit/maintenance/${model}_test.rb`);
        }

        // # run tests for web
        regexp = new RegExp(/^.*components\/.*\/(.*)\.tsx$/);
        matches = regexp.exec(filename);
        if (matches !== null) {
            let model = matches[1];
            potential_test_files.add(`${filename}/tests/${model}.test.tsx`);
        }

        let available_test_files: string[] = [];
        for(let filename of potential_test_files) {
            let test_file_name = this.workspaceRoot + "/" + filename;
            fs.access(test_file_name, fs.constants.F_OK, (err) => {
                if (err) {
                    console.log(`${test_file_name} does not exist on the filesystem`);
                } else {
                    available_test_files.push(test_file_name);
                }
            });
        }
        return available_test_files;
    }

    dispose() {
    }

}


class TestFileController {
    private _fileFinder: FileFinder;
    private _disposable: Disposable;

    constructor(fileFinder: FileFinder) {
        this._fileFinder = fileFinder;

        // subscribe to selection change and editor activation events
        let subscriptions: Disposable[] = [];
        window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        // update the counter for the current file
        this._fileFinder.updateTestFile();

        // create a combined disposable from both event subscriptions
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._fileFinder.updateTestFile();
    }
}
