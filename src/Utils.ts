import {readFileSync} from 'fs';
import {window} from 'vscode';

/**
 * Utils class of the lua-mtavscode extension.
 */
export default class Utils {
    /**
     * Allows to convert a string's first letter to uppercase.
     * @param str 
     */
    public static firstLetterUpper(str: string) {
        return str.charAt(0).toUpperCase() + str.substring(1);
    }

    /**
     * This method reads a JSON file SYNCHRONOUSLY. Please be careful when trying to read or parsing large files.
     * @param path 
     * @returns 
     */
    public static loadJsonFile(path: string) {
        try {
            const generatedPath: string = `${__dirname}/${path}`;
            const data: string = readFileSync(generatedPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            window.showErrorMessage("An error has occurred trying to read the following filepath: " + path);
        }
    }
}