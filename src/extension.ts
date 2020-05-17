// Import the vscode extension API.
import * as vscode from 'vscode';
import { MTAClass } from './MTAClass';
import Utils from './Utils';
import { MTASymbol } from './MTASymbol';

let eventCompletionProvider: vscode.Disposable;
let structuredCompletionProvider: vscode.Disposable;

let oopStaticCompletionProvider: vscode.Disposable;
let oopCompletionProvider: vscode.Disposable;

let clientKeywords: Array<string> = [];
let serverKeywords: Array<string> = [];
let scriptSide: string = "";

let classes: Array<MTAClass> = [];
/**
 * Method called when the extension has been activated. The extension is only activated when Lua files
 * that have the correct pattern to be used.
 * @param context The extension context.
 */
export function activate(context: vscode.ExtensionContext) {
	// debug
	vscode.window.showInformationMessage("lua-mtavscode is now running.");
	
	// Load all the classes.
	let classList: Array<string> = [
		"account",
		"player"
	];
	
	// And create the MTAClass object.
	classList.forEach((cls) => {
		let mtaClass: MTAClass = new MTAClass(cls);
		classes.push(mtaClass);
	});

	// get the current workspace configuration
	let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

	// Create the completion items aka the IntelliSense list ONLY for the event symbols.
	eventCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
			// Create a completionItems list.
			let completionItems: vscode.CompletionList = new vscode.CompletionList();

			classes.forEach((mtaClass) => {
				let symbols = Object.entries(mtaClass.symbolList).filter(([name, symbol]) => symbol.type === "event" && symbol.scriptSide === scriptSide);
				symbols.forEach(([name, symbol]) => {
					let completionItem: any = createCompletionItem(symbol, false);
					if (completionItem) {
						completionItems.items.push(completionItem);
					}
				});
			});
			return completionItems;
		}
	}, "");
	context.subscriptions.push(eventCompletionProvider);

	registerStructuredProviders(context, config);
	registerOOPProviders(context, config);

	// watch for configuration changes
	vscode.workspace.onDidChangeConfiguration(event => {
		let affected = event.affectsConfiguration("lua-mtavscode");
		if (affected) {
			// reload config
			config = vscode.workspace.getConfiguration();
			registerStructuredProviders(context, config);
			registerOOPProviders(context, config);

			// reload the allowed keywords.
			loadClientKeywords(config);
			loadServerKeywords(config);
		}
	});

	loadClientKeywords(config);
	loadServerKeywords(config);

	// watch for switching files.
	vscode.window.onDidChangeActiveTextEditor((textEditor) => {
		if (textEditor) {
			let document: vscode.TextDocument = textEditor.document;
			getFileSide(document);
		}
	});

	let textEditor: vscode.TextEditor|undefined = vscode.window.activeTextEditor;
	if (textEditor) {
		let document: vscode.TextDocument = textEditor.document;
		getFileSide(document);
	}
}

function getFileSide(document: vscode.TextDocument): string {
	if (document && !document.isUntitled) {
		let filePath: string = document.uri.fsPath;
		let lastPosition: number = filePath.lastIndexOf("/");
		let fileName: string = filePath.substr(lastPosition);
		
		let clientFile = clientKeywords.some((keyword) => fileName.includes(keyword));
		let serverFile = serverKeywords.some((keyword) => fileName.includes(keyword));

		if (clientFile && !serverFile) {
			scriptSide = "client";
		} else if (!clientFile && serverFile) {
			scriptSide = "server";
		} else {
			scriptSide = "shared";
		}
	} else {
		scriptSide = "shared";
	}
	vscode.window.showInformationMessage("Scriptside: " + scriptSide);
	return scriptSide;
}

function registerStructuredProviders(context: vscode.ExtensionContext, config: vscode.WorkspaceConfiguration) {
	if (structuredCompletionProvider) {
		structuredCompletionProvider.dispose();
	}

	if (config.get("lua-mtavscode.provideStructuredCompletion")) {
		// Create the completion items aka the IntelliSense list.
		structuredCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				// Create a completionItems list.
				let completionItems: vscode.CompletionList = new vscode.CompletionList();
	
				classes.forEach((mtaClass) => {
					let symbols = Object.entries(mtaClass.symbolList).filter(([name, symbol]) => symbol.type === "method" && symbol.scriptSide === scriptSide);
					symbols.forEach(([name, symbol]) => {
						let completionItem: any = createCompletionItem(symbol, false);
						if (completionItem) {
							completionItems.items.push(completionItem);
						}
					});
				});
				return completionItems;
			}
		}, "");
		context.subscriptions.push(structuredCompletionProvider);
	}
}

function registerOOPProviders(context: vscode.ExtensionContext, config: vscode.WorkspaceConfiguration) {
	if (oopStaticCompletionProvider) {
		oopStaticCompletionProvider.dispose();
	}

	if (oopCompletionProvider) {
		oopCompletionProvider.dispose();
	}

	if (config.get("lua-mtavscode.provideOOPCompletion")) {
		// Create the completion items aka the IntelliSense list ONLY for static methods.
		oopStaticCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				// Create a completionItems list.
				let completionItems: vscode.CompletionList = new vscode.CompletionList();
	
				classes.forEach((mtaClass) => {
					let symbols = Object.entries(mtaClass.symbolList).filter(([name, symbol]) => symbol.type === "method" && symbol.isOOPStatic && symbol.scriptSide === scriptSide);
					symbols.forEach(([name, symbol]) => {
						let completionItem: any = createCompletionItem(symbol, true);
						if (completionItem) {
							completionItems.items.push(completionItem);
						}
					});
				});
				return completionItems;
			}
		}, ".");
		context.subscriptions.push(oopStaticCompletionProvider);

		// Create the completion items aka the IntelliSense list ONLY for normal OOP methods.
		oopCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				// Create a completionItems list.
				let completionItems: vscode.CompletionList = new vscode.CompletionList();
	
				classes.forEach((mtaClass) => {
					let symbols = Object.entries(mtaClass.symbolList).filter(([name, symbol]) => symbol.type === "method" && !symbol.isOOPStatic && symbol.scriptSide === scriptSide);
					symbols.forEach(([name, symbol]) => {
						let completionItem: any = createCompletionItem(symbol, true);
						if (completionItem) {
							completionItems.items.push(completionItem);
						}
					});
				});
				return completionItems;
			}
		}, ":");
		context.subscriptions.push(oopCompletionProvider);
	}
}

function loadClientKeywords(config: vscode.WorkspaceConfiguration): void {
	clientKeywords = config.get("lua-mtavscode.clientSideFileKeywords") ?? [];
}

function loadServerKeywords(config: vscode.WorkspaceConfiguration): void {
	serverKeywords = config.get("lua-mtavscode.serverSideFileKeywords") ?? [];
}

function createCompletionItem(mtaSymbol: MTASymbol, oopOnly: boolean = false): vscode.CompletionItem|undefined {
	let itemKind: vscode.CompletionItemKind;
	let className: string = Utils.firstLetterUpper(mtaSymbol.parentClass);
	let symbolName: string = mtaSymbol.name;
	let detailType: string = "method";
	let insertText: string = mtaSymbol.insertText;

	if (mtaSymbol.type === "method") {
		itemKind = vscode.CompletionItemKind.Method;
		if (!mtaSymbol.oopName) {
			itemKind = vscode.CompletionItemKind.Constructor;
			detailType = "constructor method";
		}

		if (oopOnly) {
			symbolName = mtaSymbol.oopName ?? className;
			insertText = mtaSymbol.insertTextOOP;
		}

	} else {
		itemKind = vscode.CompletionItemKind.Event;
		detailType = "event";
	}

	let completionItem: vscode.CompletionItem = new vscode.CompletionItem(symbolName, itemKind);
	completionItem.documentation = mtaSymbol.mdString;
	completionItem.insertText = new vscode.SnippetString(insertText);
	completionItem.detail = `${className} class - ${detailType} - ${mtaSymbol.scriptSide}`;

	if (mtaSymbol.isDeprecated) {
		let tags: ReadonlyArray<vscode.CompletionItemTag> = [vscode.CompletionItemTag.Deprecated];
		completionItem.tags = tags;
	}
	return completionItem;
}

/**
 * Method called when the extension deactivates.
 */
export function deactivate() {}