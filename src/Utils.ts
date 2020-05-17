
export default class Utils {
    public static firstLetterUpper(str: string) {
        return str.charAt(0).toUpperCase() + str.substr(1);
    }
}