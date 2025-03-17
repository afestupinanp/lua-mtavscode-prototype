/** Configuration keyword for the vscode extension settings. */
export const CONFIG_KEYWORD: string = 'lua-mtavscode';
/** Configuration setting for the clientside keywords to trigger detection in that scriptside. */
export const CONFIG_CLIENT_KEYWORDS: string = `${CONFIG_KEYWORD}.clientSideFileKeywords`;
/** Configuration setting for the serverside keywords to trigger detection in that scriptside. */
export const CONFIG_SERVER_KEYWORDS: string = `${CONFIG_KEYWORD}.serverSideFileKeywords`;

/**
 * Template client lua file, for project scaffolding
 */
export const CLIENT_LUA_FILE = ``;

/**
 * Template server lua file, for project scaffolding
 */
export const SERVER_LUA_FILE = `addEventHandler("onPlayerJoin", root, function ()
	local playerName = getPlayerName(source)
	outputChatBox(string.format("%s joined the server!", playerName))
	spawnPlayer(source, 0, 0, 5, 0, math.random(0,288), 0, 0)
	fadeCamera(source, true)
	setCameraTarget(source, source)
end)

addEventHandler('onPlayerQuit', root, function ()
	local playerName = getPlayerName(source)
	outputChatBox(string.format("%s has left the server!", playerName))
end)
`;

/**
 * Template meta.xml file, for project scaffolding
 */
export const META_XML_FILE = `<meta>
	<info author="{author}" description="{description}" name="{name}" type="{resourceType}" />
	<script src="server.lua" type="server" />
	<script src="client.lua" type="client" />
	<script src="shared.lua" type="shared" />
</meta>
`;

// k2 digital
// clientes nacionales
