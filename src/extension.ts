import * as vscode from 'vscode';

import { MTAClass } from './classes/MTAClass';
import { MTASymbol } from './classes/MTASymbol';
import Utils from './Utils';
import { CLIENT_LUA_FILE, CONFIG_CLIENT_KEYWORDS, CONFIG_KEYWORD, CONFIG_SERVER_KEYWORDS, META_XML_FILE, SERVER_LUA_FILE } from './constants';
import SymbolType from './enums/SymbolType';
import Scriptside from './enums/Scriptside';

let eventCompletionProvider: vscode.Disposable;
let structuredCompletionProvider: vscode.Disposable;

let clientKeywords: Array<string> = [];
let serverKeywords: Array<string> = [];
let scriptSide: string = "";
let currentFilePath: string = "";

let globalSymbolList: Record<string, MTASymbol> = {};
let mtaKeywordList: Record<string, string> = {};

let isProduction: boolean = false;


/**
 * Method called when the extension has been activated. The extension is only activated when Lua files
 * that have the correct pattern to be used.
 * @param context The extension context.
 */
export function activate(context: vscode.ExtensionContext) {
	isProduction = context.extensionMode == vscode.ExtensionMode.Production;

	// debug
	if (!isProduction) {
		vscode.window.showInformationMessage("lua-mtavscode is now running.");
	}
	
	// Load generated file of symbols.
	let mtaClass: MTAClass = new MTAClass('generated');
	Object.assign(globalSymbolList, mtaClass.symbolList);

	// Load MTA keywords.
	Object.assign(mtaKeywordList, Utils.loadJsonFile('symbols/mta-keywords.json'));

	// get the current workspace configuration
	let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

	// Create the completion items aka the IntelliSense list ONLY for the event symbols.
	eventCompletionProvider = vscode.languages.registerCompletionItemProvider("lua", {
		// provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
		provideCompletionItems() {
			// Create a completionItems list.
			let completionItems: vscode.CompletionList = new vscode.CompletionList();

			let symbols = Object.entries(globalSymbolList).filter(([_name, symbol]) => symbol.type === SymbolType.EVENT && symbol.scriptSide === scriptSide);
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

	context.subscriptions.push(vscode.commands.registerCommand(`${CONFIG_KEYWORD}.scaffold-project`, handleScaffoldProject));
}

/**
 * This method handles the project creation.
 * @returns 
 */
function handleScaffoldProject(): void {
	const workspaces: readonly vscode.WorkspaceFolder[]|undefined = vscode.workspace.workspaceFolders ?? [];
	if (!workspaces.length) {
		vscode.window.showErrorMessage("Creating a new project requires that you at least have one workspace/folder open.");
		return;
	}

	vscode.window.showWorkspaceFolderPick({ignoreFocusOut: true}).then((selectedWorkspace: vscode.WorkspaceFolder|undefined) => {
		let realWorkspace: vscode.WorkspaceFolder;
		if (!selectedWorkspace) {
			realWorkspace = workspaces[0];
		} else {
			realWorkspace = selectedWorkspace;
		}
		vscode.window.showInputBox({title: "Type the new name of the resource you want to create."}).then((name: string|undefined) => {
			vscode.window.showInputBox({title: "Type the description of the resource"}).then((description: string|undefined) => {
				vscode.window.showInputBox({title: "Type the author of the resource"}).then((author: string|undefined) => {
					vscode.window.showQuickPick(['gamemode', 'script', 'map', 'misc'], {title: "Select the resource type", canPickMany: false}).then((resourceType: string|undefined) => {
						vscode.window.showQuickPick(['Yes', 'No'], {title: "Do you want to create a git repo for this?", canPickMany: false}).then((createRepo: string|undefined) => {
							const createGitRepo: boolean = createRepo == 'No' || !createRepo ? false : true;
							let metaFile: string = META_XML_FILE;
							metaFile = metaFile.replace('{author}', author);
							metaFile = metaFile.replace('{description}', description);
							metaFile = metaFile.replace('{name}', name);
							metaFile = metaFile.replace('{resourceType}', resourceType);
							
							const serverFile: string = SERVER_LUA_FILE;
							const clientFile: string = CLIENT_LUA_FILE;

							const textEncoder = new TextEncoder();

							vscode.workspace.fs.writeFile(vscode.Uri.joinPath(selectedWorkspace.uri, 'meta.xml'), textEncoder.encode(metaFile));
							vscode.workspace.fs.writeFile(vscode.Uri.joinPath(selectedWorkspace.uri, 'server.lua'), textEncoder.encode(serverFile));
							vscode.workspace.fs.writeFile(vscode.Uri.joinPath(selectedWorkspace.uri, 'client.lua'), textEncoder.encode(clientFile));

							if (createGitRepo) {
								const extensionContext = vscode.extensions.getExtension('vscode.git');
								if (!extensionContext) {
									vscode.window.showErrorMessage("Cannot initialize git repo: extension not available. (is git installed in your system?)");
									return;
								}
								extensionContext.exports.getAPI(1).init(selectedWorkspace.uri);
							}
						});
						
					});
				});
			});
	
		});
	});
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
			scriptSide = Scriptside.CLIENT;
		} else if (!clientFile && serverFile) {
			scriptSide = Scriptside.SERVER;
		} else {
			scriptSide = Scriptside.SHARED;
		}
	} else {
		// we don't know the scriptside, so we assume it's shared.
		scriptSide = Scriptside.SHARED;
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

			let symbols = Object.entries(globalSymbolList).filter(([_name, symbol]) => symbol.type === SymbolType.METHOD && symbol.scriptSide === scriptSide || symbol.scriptSide == Scriptside.SHARED);
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
				const mtaKeywordDescription: string = mtaKeywordList[symbolName] ?? null;
				if (mtaKeywordDescription) {
					return new vscode.Hover(mtaKeywordDescription);
				}

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

	if (mtaSymbol.type === SymbolType.METHOD) {
		itemKind = vscode.CompletionItemKind.Method;
		symbolType = SymbolType.METHOD;

	} else {
		itemKind = vscode.CompletionItemKind.Event;
		symbolType = SymbolType.EVENT;
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