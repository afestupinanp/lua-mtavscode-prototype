import {MTASymbol} from './MTASymbol';

/**
 * This class describes one of the elements descending from the root element in the MTA element tree. On simple
 * terms, it wraps up the possible methods and events of a class.
 */
export class MTAClass {
    
    /**
     * String that represents the MTA class name.
     */
    public className: string;
    /**
     * Object that holds the unparsed symbol list.
     */
    private jsonSymbol: Object;
    /**
     * Object that holds all the symbols, now ready and parsed.
     */
    public symbolList: Object = {};


    public constructor(className: string) {
        this.jsonSymbol = require("./symbols/" + className.toLowerCase() + ".json");

        this.className = className;
        // We have to iterate over the registered symbols in the JSON file...
        if (this.jsonSymbol) {
            Object.entries(this.jsonSymbol).forEach(([symbolName, symbol]) => {
                // create the symbol and add it to the list.
                let mtaSymbol: MTASymbol = this.createSymbol(symbol, symbolName, className);
                this.addSymbolToList(mtaSymbol, symbolName);
            });
        }
    }

    /**
     * This method allows to create a new Object and add it to the list of symbols of the class.
     * By symbol, it can be a method or an event.
     * @param symbol The symbol wrapped up in the MTASymbol class.
     * @param symbolName The current class name. 
     */
    private addSymbolToList(symbol: MTASymbol, symbolName: string): void {
        Object.assign(this.symbolList, {[symbolName]: symbol});
    }

    /**
     * This method instantiates a new MTASymbol class, which is used to describe and parse the symbol found in the loaded class.
     * @param symbol The object of the symbol loaded.
     * @param symbolName The name of the symbol.
     */
    public createSymbol(symbol: Object, symbolName: string, className: string): MTASymbol {
        let mtaSymbol: MTASymbol = new MTASymbol(symbol, symbolName, className);
        return mtaSymbol;
    }

}