/**
 * @name DeezerRP
 * @description Adds Deezer integration (just like Spotify) (Due to Deezer's API restrictions, it only shows your last played song, not your current one. :/)
 * @author Stealth (imnotstealth)
 * @version 1.0.0
 * @source https://github.com/ImNotStealth/DeezerRP/blob/master/DeezerRP.plugin.js
 */

// My License
/*
    MIT License

    Copyright (c) 2024 Stealth

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

/*
    Below are the licenses that I found from https://github.com/eritbh/LastFMRichPresence/blob/main/LastFMRichPresence.plugin.js
    My plugin is heavily inspired (code-wise) by dimden's plugin. (I only changed it to work with Deezer and improved the settings panel)
    This is also my first plugin so if I did anything wrong or there's something that can be improved, make a pull request and I'll happily take a look!
*/

/*
MIT License

Copyright (c) 2022 dimden

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Lot of code is taken from AutoStartRichPresence plugin, thank you friend
/*
MIT License

Copyright (c) 2018-2022 Mega-Mewthree

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/*
* Copyright (c) 2022 Sofia Lima
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const ClientID = "1208754831657934888";

const defaultSettings = {
    disableWhenSpotify: true,
	disableWhenActivity: true,
	listeningTo: true,
	artistActivityName: false,
	listenAlongButton: true,
	showAlbumCover: true,
    userID: "",
    accessToken: "",
    appID: "",
    redirectURI: "",
    loginCode: "",
    appSecret: ""
}

let currentTrack = {
    title: "Unknown",
    link: "https:\/\/www.deezer.com\/",
    artist: "Unknown",
    cover: "deezer_logo"
}

class DeezerRP {
    constructor(meta) {
        this.pluginStarted = false;
        this.rpc = {};
        this.rpc = BdApi.findModuleByProps("dispatch", "_subscriptions");
        this.getLocalPresence = BdApi.findModuleByProps("getLocalPresence").getLocalPresence;
        this.startPlaying = Date.now();
        this.taskID = -1;
        this.request = require("request");

        let filter = BdApi.Webpack.Filters.byStrings("getAssetImage: size must === [number, number] for Twitch");
        let assetManager = BdApi.Webpack.getModule(m => typeof m === "object" && Object.values(m).some(filter));
        let getAsset;
        for (const key in assetManager) {
            const member = assetManager[key];
            if (member.toString().includes("APPLICATION_ASSETS_FETCH")) {
                getAsset = member;
                break;
            }
        }
        this.getAsset = async key => {
            return (await getAsset(ClientID, [key, undefined]))[0];
        };
    }

    start() {
        this.settings = BdApi.loadData("DeezerRP", "settings") || {};
        for (const setting of Object.keys(defaultSettings)) {
            if (typeof this.settings[setting] === "undefined") {
                this.settings[setting] = defaultSettings[setting];
            }
            this.saveSettings();
        }

        this.updateRichPresence();
        this.taskID = setInterval(() => this.updateRichPresence(), 1000 * 30);
        this.pluginStarted = true;
    }

    stop() {
        clearInterval(this.taskID);
        this.taskID = -1;
        this.startPlaying = 0;
        currentTrack = {};
        this.setActivity({});
        this.pluginStarted = false;
    }

    setActivity(activity) {
        this.rpc.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: activity
        });
    }

    async updateRichPresence() {
        if (!this.settings.userID || !this.settings.accessToken || !this.settings.appID || !this.settings.redirectURI || !this.settings.loginCode || !this.settings.appSecret)
        {
            this.showAlertBanner("Please set up DeezerRP in your Plugin Settings.");
            return;
        }

        if (this.settings.disableWhenSpotify === true) {
            const activities = this.getLocalPresence().activities;
            if (activities.find(a => a.name === "Spotify")) {
                if (activities.find(a => a.application_id === ClientID)) {
                    this.setActivity({});
                }
                return;
            }
        }
        
		if (this.settings.disableWhenActivity === true) {
            const activities = this.getLocalPresence().activities;
            if (activities.filter(a => a.application_id !== ClientID).length) {
                if (activities.find(a => a.application_id === ClientID)) {
					this.setActivity({});
                }
                return;
            }
        }

        currentTrack = await this.updateCurrentTrack();

        let button_urls = [currentTrack.link], buttons = ["Listen along"];
        let obj = {
            application_id: ClientID,
            name: this.settings.artistActivityName ? currentTrack.artist : "Deezer",
            details: currentTrack.title,
            state: "by " + currentTrack.artist,
            timestamps: { start: this.startPlaying ? Math.floor(this.startPlaying / 1000) : Math.floor(Date.now() / 1000) },
            assets: {
                large_image: this.settings.showAlbumCover ? await this.getAsset(currentTrack.cover) : await this.getAsset("deezer_logo")
            },
            type: this.settings.listeningTo ? 2 : 0
        }

        if (this.settings.listenAlongButton === true) {
            obj.metadata = { button_urls };
            obj.buttons = buttons;
            obj.flags = 1;
        }

        if (this.settings.showAlbumCover === true) {
            obj.assets.small_image = await this.getAsset("deezer_logo");
        }

        this.setActivity(obj);
    }

    updateCurrentTrack() {
        return new Promise((resolve, reject) => {
            this.request(`https://api.deezer.com/user/${this.settings.userID}/history?access_token=${this.settings.accessToken}&index=0&limit=1`, async (err, response, body) => {
                if(err) {
                    console.log(err);
                    return reject("Deezer has returned an error.");
                }
                let json;
                try {
                    json = JSON.parse(body);
                } catch (e) {
                    return reject(e);
                }

                if (json.error) {
                    const errMsg = "DeezerRP has encountered an error: " + json.error.message;
                    this.showAlertBanner(errMsg);
                    return reject(errMsg);  
                }

                let newTrack = {
                    title: json.data[0].title,
                    link: json.data[0].link,
                    artist: json.data[0].artist.name,
                    cover: json.data[0].album.cover_big
                }
                resolve(newTrack);
            });
        });
    }

    showAlertBanner(msg) {
        const buttons = [
            {
                label: "Disable Plugin",
                onClick: () => {BdApi.Plugins.disable("DeezerRP")}
            }
        ];
        BdApi.showNotice(msg, {type: "error", buttons, timeout: 5000});
    }

    saveSettings() {
        BdApi.saveData("DeezerRP", "settings", this.settings);
    }

    getSettingsPanel() {
        if (!this.pluginStarted) return;
        let template = document.createElement("template");
        template.innerHTML = 
        `<div style="color: var(--header-primary);font-size: 16px;font-weight: 300;line-height: 22px;max-width: 550px;margin-top: 17px;">

        <h1 class="colorStandard__5111e size20__99138 strong__068cd">Configuration</h1>
        <br>

        <span>If you want a visual guide, you can follow the tutorial on <a href="https://github.com/ImNotStealth/DeezerRP" target="_blank">GitHub</a>.</span>
        <br><br>

        <b>Deezer App ID</b>
        <br>
        <span>Input your Deezer App ID. You can create an application <a href="https://developers.deezer.com/myapps/" target="_blank">here</a>.</span><br>
        <input class="dzAppID inputDefault__80165 input_d266e7" placeholder="App ID (Example: 123456)">
        <br><br>

        <b>Redirect URI</b>
        <br>
        <span>This should match <b>exactly</b> what you used in your Application settings.</span><br>
        <input class="dzRedirectURI inputDefault__80165 input_d266e7" placeholder="Redirect URI (Example: https://google.com/)">
        <br><br>

        <b>App Secret</b>
        <br>
        <span>Input your Deezer App Secret (Found in your Application settings)</span><br>
        <input class="dzAppSecret inputDefault__80165 input_d266e7" placeholder="App Secret (Example: 123a1b6gg98hu12345678b0p5pqd0at9)">
        <br><br>

        <span>Click <a class="dzLinkLogin" target="_blank">here</a> to login.</span>
        <br>
        <span>Once logged in, copy everything after "?code=" from the URL into the text box below.</span>
        <br><br>

        <b>Login Code</b>
        <br>
        <span>Input your Login Code</span><br>
        <input class="dzLoginCode inputDefault__80165 input_d266e7" placeholder="Login Code (Example: 123a1b6gg98hu12345678b0p5pqd0at9)">
        <br><br>

        <span>Click <a class="dzLinkToken" target="_blank">here</a> to get your access token.</span>
        <br>
        <span>Next, copy everything between "access_token=" and "&expires" from the result into the text box below.</span>
        <br><br>

        <b>Access Token</b>
        <br>
        <span>Finally, input your Access Token (This is only used for seeing your track history and can't be used to retrieve your account or any personal info)</span><br>
        <input class="dzAccessToken inputDefault__80165 input_d266e7" placeholder="Access Token (Example: fruCX6s5HE9IeVXY4XI0Hd9W1FiFqp...)">
        <br><br>

        <b>Deezer User ID</b>
        <br>
        <span>Input your Access Token (can be found on the <a href="https://deezer.com/" target="_blank">Deezer Home Page</a> by clicking on your Profile and checking the URL)</span><br>
        <input class="dzUserID inputDefault__80165 input_d266e7" placeholder="User ID (Example: 1234567890)">
        <br><br>

        <div class="bd-setting-divider"></div>

        <br>
        <h1 class="colorStandard__5111e size20__99138 strong__068cd">Customization</h1>
        <br>

        <div class="bd-setting-item inline"><div class="bd-setting-header"><label class="bd-setting-title">Disable when Spotify is active</label><div class="dzDisableWhenSpotifyBtn bd-switch bd-switch-checked"><input type="checkbox" checked=""><div class="bd-switch-body"><svg class="bd-switch-slider" viewBox="0 0 28 20" preserveAspectRatio="xMinYMid meet"><rect class="bd-switch-handle" fill="white" x="4" y="0" height="20" width="20" rx="10"></rect><svg class="bd-switch-symbol" viewBox="0 0 20 20" fill="none"><path></path><path></path></svg></svg></div></div></div></div>
        <div class="bd-setting-item inline"><div class="bd-setting-header"><label class="bd-setting-title">Disable when other Activity is active</label><div class="dzDisableWhenActivityBtn bd-switch bd-switch-checked"><input type="checkbox" checked=""><div class="bd-switch-body"><svg class="bd-switch-slider" viewBox="0 0 28 20" preserveAspectRatio="xMinYMid meet"><rect class="bd-switch-handle" fill="white" x="4" y="0" height="20" width="20" rx="10"></rect><svg class="bd-switch-symbol" viewBox="0 0 20 20" fill="none"><path></path><path></path></svg></svg></div></div></div></div>
        <div class="bd-setting-item inline"><div class="bd-setting-header"><label class="bd-setting-title">Using Listening instead of Playing as status</label><div class="dzListeningTo bd-switch bd-switch-checked"><input type="checkbox" checked=""><div class="bd-switch-body"><svg class="bd-switch-slider" viewBox="0 0 28 20" preserveAspectRatio="xMinYMid meet"><rect class="bd-switch-handle" fill="white" x="4" y="0" height="20" width="20" rx="10"></rect><svg class="bd-switch-symbol" viewBox="0 0 20 20" fill="none"><path></path><path></path></svg></svg></div></div></div></div>
        <div class="bd-setting-item inline"><div class="bd-setting-header"><label class="bd-setting-title">Show artist as Activity name</label><div class="dzArtistActivityName bd-switch bd-switch-checked"><input type="checkbox" checked=""><div class="bd-switch-body"><svg class="bd-switch-slider" viewBox="0 0 28 20" preserveAspectRatio="xMinYMid meet"><rect class="bd-switch-handle" fill="white" x="4" y="0" height="20" width="20" rx="10"></rect><svg class="bd-switch-symbol" viewBox="0 0 20 20" fill="none"><path></path><path></path></svg></svg></div></div></div></div>
        <div class="bd-setting-item inline"><div class="bd-setting-header"><label class="bd-setting-title">Show Listen Along button</label><div class="dzListenAlongButton bd-switch bd-switch-checked"><input type="checkbox" checked=""><div class="bd-switch-body"><svg class="bd-switch-slider" viewBox="0 0 28 20" preserveAspectRatio="xMinYMid meet"><rect class="bd-switch-handle" fill="white" x="4" y="0" height="20" width="20" rx="10"></rect><svg class="bd-switch-symbol" viewBox="0 0 20 20" fill="none"><path></path><path></path></svg></svg></div></div></div></div>
        <div class="bd-setting-item inline"><div class="bd-setting-header"><label class="bd-setting-title">Show album cover in Activity</label><div class="dzShowAlbumCover bd-switch bd-switch-checked"><input type="checkbox" checked=""><div class="bd-switch-body"><svg class="bd-switch-slider" viewBox="0 0 28 20" preserveAspectRatio="xMinYMid meet"><rect class="bd-switch-handle" fill="white" x="4" y="0" height="20" width="20" rx="10"></rect><svg class="bd-switch-symbol" viewBox="0 0 20 20" fill="none"><path></path><path></path></svg></svg></div></div></div></div>

        `;
        let dzAppID = template.content.firstElementChild.getElementsByClassName('dzAppID')[0];
        let dzRedirectURI = template.content.firstElementChild.getElementsByClassName('dzRedirectURI')[0];
        let dzLoginCode = template.content.firstElementChild.getElementsByClassName('dzLoginCode')[0];
        let dzAppSecret = template.content.firstElementChild.getElementsByClassName('dzAppSecret')[0];
        let dzAccessToken = template.content.firstElementChild.getElementsByClassName('dzAccessToken')[0];
        let dzUserID = template.content.firstElementChild.getElementsByClassName('dzUserID')[0];
        let dzDisableWhenSpotifyBtn = template.content.firstElementChild.getElementsByClassName('dzDisableWhenSpotifyBtn')[0];
        let dzDisableWhenActivityBtn = template.content.firstElementChild.getElementsByClassName('dzDisableWhenActivityBtn')[0];
        let dzListeningTo = template.content.firstElementChild.getElementsByClassName('dzListeningTo')[0];
        let dzArtistActivityName = template.content.firstElementChild.getElementsByClassName('dzArtistActivityName')[0];
        let dzListenAlongButton = template.content.firstElementChild.getElementsByClassName('dzListenAlongButton')[0];
        let dzShowAlbumCover = template.content.firstElementChild.getElementsByClassName('dzShowAlbumCover')[0];
        let dzLinkLogin = template.content.firstElementChild.getElementsByClassName('dzLinkLogin')[0];
        let dzLinkToken = template.content.firstElementChild.getElementsByClassName('dzLinkToken')[0];

        dzAppID.value = this.settings.appID ?? "";
        dzRedirectURI.value = this.settings.redirectURI ?? "";
        dzLoginCode.value = this.settings.loginCode ?? "";
        dzAppSecret.value = this.settings.appSecret ?? "";
        dzAccessToken.value = this.settings.accessToken ?? "";
        dzUserID.value = this.settings.userID ?? "";    

        let updateLoginLink = () => {
            dzLinkLogin.href = `https://connect.deezer.com/oauth/auth.php?app_id=${this.settings.appID}&redirect_uri=${this.settings.redirectURI}&perms=listening_history,offline_access`;
        }
        let updateTokenLink = () => {
            dzLinkToken.href = `https://connect.deezer.com/oauth/access_token.php?app_id=${this.settings.appID}&secret=${this.settings.appSecret}&code=${this.settings.loginCode}`;
        }

        let loadToggleButton = (el, setting) => {
            el.classList.toggle("bd-switch-checked", this.settings[setting] === true);
            el.getElementsByTagName("input")[0].toggleAttribute("checked", this.settings[setting] === true);
        }

        updateLoginLink();
        updateTokenLink();
        loadToggleButton(dzDisableWhenSpotifyBtn, "disableWhenSpotify");
        loadToggleButton(dzDisableWhenActivityBtn, "disableWhenActivity");
        loadToggleButton(dzListeningTo, "listeningTo");
        loadToggleButton(dzArtistActivityName, "artistActivityName");
        loadToggleButton(dzListenAlongButton, "listenAlongButton");
        loadToggleButton(dzShowAlbumCover, "showAlbumCover");

        let updateAppID = () => {
            this.settings.appID = dzAppID.value;
            updateLoginLink();
            updateTokenLink();
            this.saveSettings();
        }
        let updateRedirectURI = () => {
            this.settings.redirectURI = dzRedirectURI.value;
            updateLoginLink();
            this.saveSettings();
        }
        let updateLoginCode = () => {
            this.settings.loginCode = dzLoginCode.value;
            updateTokenLink();
            this.saveSettings();
        }
        let updateAppSecret = () => {
            this.settings.appSecret = dzAppSecret.value;
            updateTokenLink();
            this.saveSettings();
        }
        let updateAccessToken = () => {
            this.settings.accessToken = dzAccessToken.value;
            this.saveSettings();
        }
        let updateUserID = () => {
            this.settings.userID = dzUserID.value;
            this.saveSettings();
        }
        let updateToggleButton = (el, setting) => {
            el.classList.toggle("bd-switch-checked");
            el.getElementsByTagName("input")[0].toggleAttribute("checked");
            this.settings[setting] = el.classList.contains("bd-switch-checked");
            this.saveSettings();
        }

        dzDisableWhenSpotifyBtn.onclick = () => { updateToggleButton(dzDisableWhenSpotifyBtn, "disableWhenSpotify")};
        dzDisableWhenActivityBtn.onclick = () => { updateToggleButton(dzDisableWhenActivityBtn, "disableWhenActivity")};
        dzListeningTo.onclick = () => { updateToggleButton(dzListeningTo, "listeningTo")};
        dzArtistActivityName.onclick = () => { updateToggleButton(dzArtistActivityName, "artistActivityName")};
        dzListenAlongButton.onclick = () => { updateToggleButton(dzListenAlongButton, "listenAlongButton")};
        dzShowAlbumCover.onclick = () => { updateToggleButton(dzShowAlbumCover, "showAlbumCover")};

        dzAppID.onchange = updateAppID;
        dzAppID.onpaste = updateAppID;
        dzAppID.onkeydown = updateAppID;

        dzRedirectURI.onchange = updateRedirectURI;
        dzRedirectURI.onpaste = updateRedirectURI;
        dzRedirectURI.onkeydown = updateRedirectURI;

        dzLoginCode.onchange = updateLoginCode;
        dzLoginCode.onpaste = updateLoginCode;
        dzLoginCode.onkeydown = updateLoginCode;

        dzAppSecret.onchange = updateAppSecret;
        dzAppSecret.onpaste = updateAppSecret;
        dzAppSecret.onkeydown = updateAppSecret;

        dzAccessToken.onchange = updateAccessToken;
        dzAccessToken.onpaste = updateAccessToken;
        dzAccessToken.onkeydown = updateAccessToken;

        dzUserID.onchange = updateUserID;
        dzUserID.onpaste = updateUserID;
        dzUserID.onkeydown = updateUserID;

        return template.content.firstElementChild;
    }
};

module.exports = DeezerRP;