/** Configuration keyword for the vscode extension settings. */
export const CONFIG_KEYWORD: string = 'lua-mtavscode';
/** Configuration setting for the clientside keywords to trigger detection in that scriptside. */
export const CONFIG_CLIENT_KEYWORDS: string = `${CONFIG_KEYWORD}.clientSideFileKeywords`;
/** Configuration setting for the serverside keywords to trigger detection in that scriptside. */
export const CONFIG_SERVER_KEYWORDS: string = `${CONFIG_KEYWORD}.serverSideFileKeywords`;