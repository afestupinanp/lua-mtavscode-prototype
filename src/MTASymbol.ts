import * as vscode from 'vscode';
import Utils from './Utils';

export class MTASymbol {

    /**
     * Holds the raw JSON file of the object.
     */
    private unparsedSymbol: Object;
    // ---------- This markdown string contains all of the variables below. --------
    public mdString: vscode.MarkdownString; // this is what is presented to the user on the documentation of IntelliSense.

    public name: string;
    public parentClass: string;
    public type: string = "method";
    public scriptSide: string = "shared"; // by default, methods and events are on both scriptsides.
    public sourceElement: string = "root"; // has effect only when type === "event"

    public description: string = "";
    public docString: string = "";
    public parameters: Array<Object>; // the parameters are an array of objects that have a name, type and default properties.
    public oopParameters: Array<Object>; // debating if should be kept, as this is displayed in the OOP symbol signature.

    public mtaWiki: string = ""; // holds a link to the MTA wikia, with extra information

    public isOOPStatic: boolean = false; // has effect only when type === "method"
    public oopName: string = ""; // has effect only when type === "method"

    public isDeprecated: boolean = false; // allows to show the deprecated tags in the completion provider.
    public isCancellable: boolean = false; // has effect only when type === "event"

    public methodSignature: string; // full method signature, with name and args.
    public oopMethodSignature: string; // same as above, but with name and args.
    // ----------------------------------
    
    public insertText: string; // text to be inserted when the user selects it.
    public insertTextOOP: string; // same as above, but for OOP.

    /**
     * This class is in charge of parse the JSON file that has been read, and implement it
     * to various properties that allow to be called within the item and hover providers.
     */
    public constructor(symbolObject: Object, symbolName: string, parentClass:string) {
        this.unparsedSymbol = symbolObject;
        this.name = symbolName;
        this.parentClass = parentClass;
        // Read from the JSON loaded file.
        this.parseObject();
    }

    /**
     * This method allows to read from the unparsed JSON that describes the current symbol and allows to
     * create many elements that are used in the completion item provider and hover item provider.
     */
    private parseObject(): void {
        let object: Object = this.unparsedSymbol;
        
        // load the object properties.
        this.type = object.type;
        this.scriptSide = object.available;
        this.description = object.description;
        this.isCancellable = object.cancellable;
        this.isDeprecated = object.deprecated;
        
        this.parameters = object.parameters;
        
        this.sourceElement = object.sourceElement;
        
        // if the OOP property is defined in the object, we shall load all the properties.
        if (object.oop) {
            this.isOOPStatic = object.oop.static;
            this.oopName = object.oop.method;
            this.oopParameters = object.parameters.filter((param, index) => {
                // if it's a static method, and the first parameter includes the name of the object, we can
                // conclude it's a constructor method.
                return !(index === 0 && param.name.includes(this.parentClass));
            });
        }
        
        // Generate elements for the providers.
        this.generateSymbolSignature();
        this.generateOOPSignature();
        this.generateMTAURL();
        this.generateDocumentationString();
        this.generateMarkdownString();

        this.generateInsertText(false);
        this.generateInsertText(true);
    }
    
    /**
     * This method allows to generate the symbol signature for the documentation. Please note, this
     * method generates the structured programming version of the symbol that is being selected.
     * @returns The method returns a string, whose syntax is Markdown ready, so it can be
     * used in the documentation string.
     */
    private generateSymbolSignature(): string {
        let signature: string = "```"; // we start a code block in Markdown
        let paramString: string = this.generateParameterString(false);

        if (this.type === "method") {
            signature = `${signature}${this.name}(${paramString})\`\`\``;
        } else if (this.sourceElement && this.type === "event") {
            signature = `${signature}addEventHandler("${this.name}", ${this.sourceElement}, function(${paramString}))\`\`\`\n\n**Event source:** ${this.sourceElement} element.\n\n`;
        }

        this.methodSignature = signature;
        return this.methodSignature;
    }

    /**
     * This method allows to generate the OOP symbol signature for the documentation. Please note, this
     * method generates the Object Oriented Programming version of the symbol that is being selected.
     * @returns The method returns a string, whose syntax is Markdown ready, so it can be
     * used in the documentation string.
     */
    private generateOOPSignature(): string {
        let signature: string = "";
        let paramString: string = this.generateParameterString(true);

        // filter only methods.
        if (this.type === "method") {
            signature = "```"; // we start a code block in Markdown
            let separator: string = "";
            let className: string = this.parentClass;
            let methodName: string = "";

            // if the method is static, we use the dot syntax, and the class where it belongs.
            if (this.isOOPStatic) {
                separator = ".";
                className = Utils.firstLetterUpper(className);
            } else{ 
                // or we use the double dot if it's not static.
                separator = ":";
            }

            // verify that it has an oop name. if it doesnt, it shouldn't have a separator, nor does a method name
            // because it means it's a constructor.
            if (this.oopName) {
                methodName = this.oopName;
            } else {
                methodName = "";
                separator = "";
            }
            
            signature = `${signature}${className}${separator}${methodName}(${paramString})\`\`\``;
        }

        this.oopMethodSignature = signature;
        return this.oopMethodSignature;
    }

    /**
     * This method allows to generate a parameter string. A snippetString-ready string can be also genereted
     * using this method-
     * @param oop Boolean that says if the parameter should be taken from the oopParameters or not.
     * @param snippetApplicable Boolean that indicates whether the string should be SnippetString ready.
     * @returns a string that contains all the parameters.
     */
    private generateParameterString(oop: boolean, snippetApplicable: boolean = false): string {
        let paramString: string = ""; // 
        let usableParameters: Array<Object> = this.parameters;
        // if the method is used for OOP, we should use the OOP parameters.
        if (oop) {
            usableParameters = this.oopParameters;
        }
        
        // check if the symbol has no parameters.
        if (!usableParameters) { 
            return paramString;
        }
        
        let paramAmount: number = usableParameters.length - 1;
        let cursorPosition: number = 1;
        let usableLength: number = usableParameters.length;
        usableParameters.forEach((parameter, index) => {
            let comma: string = ", ";
            // check current cursor position, and compare it to the params length
            // so we know when to stop adding parameters, and set the final cursor.
            if (cursorPosition === usableLength) {
                comma = "";
                cursorPosition = 0;
            }
            let param: string = `${parameter.name}`;

            if (this.type === "method" || (this.type === "event" && !snippetApplicable)) {
                param = `${parameter.type} ${parameter.name}`;
            }
            
            // check for default values, so they can be seen in the documentation string!
            if (parameter.values) {
                param = `${param} = ${param.value}`;
            }

            if (snippetApplicable && this.type === "method") {
                param = `\$\{${cursorPosition}:${param}\}`;
            }

            param = `${param}${comma}`;
            paramString = `${paramString}${param}`;
            cursorPosition++;
        });

        return paramString;
    }

    /**
     * This method allows to generate the text that will be inserted, depending if it's the OOP
     * version of the symbol or not.
     * @param oop Applicable for methods only - allows to generate the insert text for the OOP version.
     * @returns Generates the symbol, with its parameter being SnippetString ready.
     */
    private generateInsertText(oop: boolean = false): string {
        let insertText: string = "";
        let parameterString: string = this.generateParameterString(oop, true);

        if (this.type === "method") {
            if (oop) {
                insertText = `${this.oopName}(${parameterString})`;
            } else {
                insertText = `${this.name}(${parameterString})`;
            }
        } else {
            insertText = `addEventHandler("${this.name}", ${this.sourceElement}, function(${parameterString})\n\t$0\n)`;
        }

        if (oop) {
            this.insertTextOOP = insertText;
            return this.insertTextOOP;
        }

        this.insertText = insertText;
        return this.insertText;
    }

    /**
     * This method allows to generate a MTA Wiki link, based on the structured method or event name.
     */
    private generateMTAURL(): void {
        this.mtaWiki = "https://wiki.multitheftauto.com/wiki/" + this.name;
    }

    /**
     * This method allows to generate the markdown string, knowing that we have
     * the document string (docString) defined.
     * @returns This method returns a MarkdownString.
     */
    private generateMarkdownString(): vscode.MarkdownString {
        this.mdString = new vscode.MarkdownString(this.docString, true);
        return this.mdString;
    }

    /**
     * This method allows to generate the documentation string, which includes the description
     * of the symbol, the signature of the symbol, link to the MTA Wiki, and more. 
     * @returns This method should return a string that is Markdown-ready.
     */
    private generateDocumentationString(): string {
        let mtaWiki: string = `[MTA Wiki ref](${this.mtaWiki})`;
        let description: string = `**Description \(${mtaWiki}\):**\n\n${this.description}`;
        let oopSegment: string = "";
        let deprecationWarning: string = "";
        let cancellableSegment: string = "";

        // add the deprecation warning if necessary.
        if (this.isDeprecated) {
            deprecationWarning = "**This symbol is deprecated and it may be removed from future MTA SA versions.**\n\n";
        }

        // verify that is a method to add the oop segment.
        if (this.type === "method") {
            if (this.isOOPStatic) {
                oopSegment = "**OOP (static method):**\n\n";
            } else {
                oopSegment = "**OOP (non-static method):**\n\n";
            }
            oopSegment = `${oopSegment}${this.oopMethodSignature}\n\n`;
        }

        // verify that is an event to add the cancellable segment.
        if (this.type === "event") {
            cancellableSegment = (this.isCancellable) ? "Yes." : "No.";
            cancellableSegment = `**Cancellable:** ${cancellableSegment}\n\n`;
        }

        this.docString = `${deprecationWarning}${this.methodSignature}\n\n${oopSegment}${cancellableSegment}${description}`;
        return this.docString;
    }

}