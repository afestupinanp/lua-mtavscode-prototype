
/**
 * Utils class of the lua-mtavscode extension.
 */
export default class Utils {
    /**
     * Allows to convert a string's first letter to uppercase.
     * @param str 
     */
    public static firstLetterUpper(str: string) {
        return str.charAt(0).toUpperCase() + str.substr(1);
    }
}