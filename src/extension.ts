import * as vscode from 'vscode';

import { MTAClass } from './MTAClass';
import { MTASymbol } from './MTASymbol';
import Utils from './Utils';


let eventCompletionProvider: vscode.Disposable;
let structuredCompletionProvider: vscode.Disposable;

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
					let completionItem: any = createCompletionItem(symbol);
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

	// watch for configuration changes
	vscode.workspace.onDidChangeConfiguration(event => {
		// check if the extension's settings were affected.
		let affected = event.affectsConfiguration("lua-mtavscode");
		if (!affected) {
			return;
		}
		// reload config
		config = vscode.workspace.getConfiguration();
		registerStructuredProviders(context, config);

		// reload the allowed keywords.
		loadClientKeywords(config);
		loadServerKeywords(config);
	});

	// initial load
	loadClientKeywords(config);
	loadServerKeywords(config);

	// watch for switching files.
	vscode.window.onDidChangeActiveTextEditor((textEditor) => {
		if (!textEditor) {
			return;
		}
		let document: vscode.TextDocument = textEditor.document;
		getFileSide(document);
	});

	// watch for file saving.
	vscode.workspace.onDidSaveTextDocument((document) => {
		getFileSide(document);
	});

	// get the current text editor and get the current scriptside
	let textEditor: vscode.TextEditor|undefined = vscode.window.activeTextEditor;
	if (textEditor) {
		let document: vscode.TextDocument = textEditor.document;
		getFileSide(document);
	}
}

/**
 * This method allows to get the current scriptside, based on the keywords provided
 * by the user.
 * @param document The current document, aka file.
 * @returns The current scriptside.
 */
function getFileSide(document: vscode.TextDocument): string {
	if (document && !document.isUntitled) {
		// get the current file path and base the scriptside from the file name
		let filePath: string = document.uri.fsPath;
		let lastPosition: number = filePath.lastIndexOf("/");
		let fileName: string = filePath.substr(lastPosition);
		
		// check if file has portion of keywords for client and server.
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
		// we don't know the scriptside, so we assume it's shared.
		scriptSide = "shared";
	}

	vscode.window.showInformationMessage("Scriptside: " + scriptSide);
	return scriptSide;
}

/**
 * This method allows to register the structured symbols to the completion list.
 * @param context The current extension context.
 * @param config The current workspace configuration.
 */
function registerStructuredProviders(context: vscode.ExtensionContext, config: vscode.WorkspaceConfiguration) {
	// dispose of the current provider, to not allow duplicates.
	if (structuredCompletionProvider) {
		structuredCompletionProvider.dispose();
	}

	// Create the completion items aka the IntelliSense list.
	structuredCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
			// Create a completionItems list.
			let completionItems: vscode.CompletionList = new vscode.CompletionList();

			classes.forEach((mtaClass) => {
				let symbols = Object.entries(mtaClass.symbolList).filter(([name, symbol]) => symbol.type === "method" && symbol.scriptSide === scriptSide);
				symbols.forEach(([name, symbol]) => {
					let completionItem: any = createCompletionItem(symbol);
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

/**
 * This method loads the client keywords from the current configuration.
 * @param config The current workspace configuration.
 */
function loadClientKeywords(config: vscode.WorkspaceConfiguration): void {
	clientKeywords = config.get("lua-mtavscode.clientSideFileKeywords") ?? [];
}

/**
 * This method loads the server keywords from the current configuration.
 * @param config The current workspace configuration.
 */
function loadServerKeywords(config: vscode.WorkspaceConfiguration): void {
	serverKeywords = config.get("lua-mtavscode.serverSideFileKeywords") ?? [];
}

/**
 * This method creates a new completion item for the completion item list.
 * @param mtaSymbol The MTA symbol.
 * @param oopOnly The boolean
 * @returns the completion item, or returns undefined
 */
function createCompletionItem(mtaSymbol: MTASymbol): vscode.CompletionItem|undefined {
	let itemKind: vscode.CompletionItemKind;
	let className: string = Utils.firstLetterUpper(mtaSymbol.parentClass);
	let symbolName: string = mtaSymbol.name;
	let detailType: string = "";
	let insertText: string = mtaSymbol.insertText;

	if (mtaSymbol.type === "method") {
		itemKind = vscode.CompletionItemKind.Method;
		detailType = "method";

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