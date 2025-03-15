import * as vscode from 'vscode';

import { MTAClass } from './MTAClass';
import { MTASymbol } from './MTASymbol';
import Utils from './Utils';

const CONFIG_KEYWORD: string = 'lua-mtavscode';
const CONFIG_CLIENT_KEYWORDS: string = 'lua-mtavscode.clientSideFileKeywords';
const CONFIG_SERVER_KEYWORDS: string = 'lua-mtavscode.serverSideFileKeywords';

const SYMBOL_METHOD: string = 'method';
const SYMBOL_EVENT: string = 'event';

const SCRIPTSIDE_SERVER = 'server';
const SCRIPTSIDE_SHARED = 'shared';
const SCRIPTSIDE_CLIENT = 'client';


let eventCompletionProvider: vscode.Disposable;
let structuredCompletionProvider: vscode.Disposable;

let clientKeywords: Array<string> = [];
let serverKeywords: Array<string> = [];
let scriptSide: string = "";
let currentFilePath: string = "";

let globalSymbolList: Record<string, MTASymbol> = {};

let isProduction: boolean = false;


/**
 * Method called when the extension has been activated. The extension is only activated when Lua files
 * that have the correct pattern to be used.
 * @param context The extension context.
 */
export function activate(context: vscode.ExtensionContext) {
	isProduction = context.extensionMode == vscode.ExtensionMode.Production;
	console.log(context.extensionMode);

	// debug
	if (!isProduction) {
		vscode.window.showInformationMessage("lua-mtavscode is now running.");
	}
	
	// And create the MTAClass object.
	let mtaClass: MTAClass = new MTAClass('generated');
	Object.assign(globalSymbolList, mtaClass.symbolList);

	// get the current workspace configuration
	let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

	// Create the completion items aka the IntelliSense list ONLY for the event symbols.
	eventCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
		// provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
		provideCompletionItems() {
			// Create a completionItems list.
			let completionItems: vscode.CompletionList = new vscode.CompletionList();

			let symbols = Object.entries(globalSymbolList).filter(([_name, symbol]) => symbol.type === SYMBOL_EVENT && symbol.scriptSide === scriptSide);
			symbols.forEach(([_name, symbol]) => {
				let completionItem: any = createCompletionItem(symbol as MTASymbol);
				if (completionItem) {
					completionItems.items.push(completionItem);
				}
			});
			return completionItems;
		}
	}, "");
	context.subscriptions.push(eventCompletionProvider);

	registerStructuredProviders(context);
	registerHoverProvider(context);

	// watch for configuration changes
	vscode.workspace.onDidChangeConfiguration(event => {
		// check if the extension's settings were affected.
		let affected = event.affectsConfiguration(CONFIG_KEYWORD);
		if (!affected) {
			return;
		}
		// reload config
		config = vscode.workspace.getConfiguration();
		registerStructuredProviders(context);
		registerHoverProvider(context);

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
		if (document.uri.fsPath == currentFilePath) {
			return;
		}
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
		currentFilePath = document.uri.fsPath;
		let lastPosition: number = currentFilePath.lastIndexOf("/");
		let fileName: string = currentFilePath.substring(lastPosition);
		
		// check if file has portion of keywords for client and server.
		let clientFile = clientKeywords.some((keyword) => fileName.includes(keyword));
		let serverFile = serverKeywords.some((keyword) => fileName.includes(keyword));

		if (clientFile && !serverFile) {
			scriptSide = SCRIPTSIDE_CLIENT;
		} else if (!clientFile && serverFile) {
			scriptSide = SCRIPTSIDE_SERVER;
		} else {
			scriptSide = SCRIPTSIDE_SHARED;
		}
	} else {
		// we don't know the scriptside, so we assume it's shared.
		scriptSide = SCRIPTSIDE_SHARED;
	}

	if (!isProduction) {
		vscode.window.showInformationMessage("Scriptside: " + scriptSide);
	}
	
	return scriptSide;
}

/**
 * This method allows to register the structured symbols to the completion list.
 * @param context The current extension context.
 * @param config The current workspace configuration.
 */
function registerStructuredProviders(context: vscode.ExtensionContext) {
	// dispose of the current provider, to not allow duplicates.
	if (structuredCompletionProvider) {
		structuredCompletionProvider.dispose();
	}

	// Create the completion items aka the IntelliSense list.
	structuredCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
		provideCompletionItems() {
			// Create a completionItems list.
			let completionItems: vscode.CompletionList = new vscode.CompletionList();

			let symbols = Object.entries(globalSymbolList).filter(([_name, symbol]) => symbol.type === SYMBOL_METHOD && symbol.scriptSide === scriptSide);
			symbols.forEach(([_name, symbol]) => {
				let completionItem: any = createCompletionItem(symbol as MTASymbol);
				if (completionItem) {
					completionItems.items.push(completionItem);
				}
			});
			return completionItems;
		}
	}, "");
	context.subscriptions.push(structuredCompletionProvider);
}

/**
 * This method registers a new hover provider.
 * @param context Current extension context.
 */
function registerHoverProvider(context: vscode.ExtensionContext) {
	let provider: vscode.Disposable = vscode.languages.registerHoverProvider("lua", {
		provideHover(document: vscode.TextDocument, position: vscode.Position) {
			// get word on range.
			let symbolRange = document.getWordRangeAtPosition(position, /[\w\.]+/);
			let symbolName = document.getText(symbolRange);
			
			// check if there are symbols.
			if (!symbolName) {
				return;
			}

			const mtaSymbol: MTASymbol|undefined = globalSymbolList[symbolName] ?? null;
			if (!mtaSymbol) {
				return;
			}

			return new vscode.Hover(mtaSymbol?.mdString);

		}
	});

	context.subscriptions.push(provider);
}

/**
 * This method loads the client keywords from the current configuration.
 * @param config The current workspace configuration.
 */
function loadClientKeywords(config: vscode.WorkspaceConfiguration): void {
	clientKeywords = config.get(CONFIG_CLIENT_KEYWORDS) ?? [];
}

/**
 * This method loads the server keywords from the current configuration.
 * @param config The current workspace configuration.
 */
function loadServerKeywords(config: vscode.WorkspaceConfiguration): void {
	serverKeywords = config.get(CONFIG_SERVER_KEYWORDS) ?? [];
}

/**
 * This method creates a new completion item for the completion item list.
 * @param mtaSymbol The MTA symbol.
 * @param oopOnly The boolean
 * @returns the completion item, or returns undefined
 */
function createCompletionItem(mtaSymbol: MTASymbol): vscode.CompletionItem|undefined {
	let itemKind: vscode.CompletionItemKind;
	let symbolName: string = mtaSymbol.name;
	let symbolType: string = "";
	let insertText: string = mtaSymbol.insertText;

	if (mtaSymbol.type === SYMBOL_METHOD) {
		itemKind = vscode.CompletionItemKind.Method;
		symbolType = SYMBOL_METHOD;

	} else {
		itemKind = vscode.CompletionItemKind.Event;
		symbolType = SYMBOL_EVENT;
	}

	let completionItem: vscode.CompletionItem = new vscode.CompletionItem(symbolName, itemKind);
	completionItem.documentation = mtaSymbol.mdString;
	completionItem.insertText = new vscode.SnippetString(insertText);
	completionItem.detail = `${Utils.firstLetterUpper(mtaSymbol?.scriptSide)} ${symbolType}`;

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