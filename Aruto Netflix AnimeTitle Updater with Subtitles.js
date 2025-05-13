// ==UserScript==
// @name         Aruto Netflix AnimeTitle Updater with Subtitles
// @namespace    https://www.arutoaru.com/
// @version      3.6
// @description  自动更新 Netflix 动画标题，并根据标题下载和显示字幕。
// @author       Toaru
// @match        https://www.netflix.com/*
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @require      https://cdn.rawgit.com/Tithen-Firion/UserScripts/7bd6406c0d264d60428cfea16248ecfb4753e5e3/libraries/xhrHijacker.js?version=1.0
// @require      https://raw.githubusercontent.com/toarusaber/toaru/refs/heads/master/app/ToaruNetflix.user.js-11000c92359c47a0e23c99e5368a80b6-subtitle%2520utils%2520module.js
// @require      https://cdn.jsdelivr.net/npm/file-saver-es@2.0.5/dist/FileSaver.min.js
// ==/UserScript==

(function () {
    "use strict";

    const NetflixUpdater = {
        animeTitleBase: "", // 存储总集名称（如动画名称）
        animeTitleEpisode: "", // 存储具体集数名称（如 S01E01）
        titleCache: {},
        currentUrl: window.location.href,
        metadataRetryInterval: null,
        logCountMetadata: 0,
        logCountFull: 0,
        fullTitleRetryCount: 0,
        MAX_FULL_TITLE_RETRIES: 100,

        getTitleFromCache() {
            const titleData = this.getXFromCache(this.titleCache, "title");
            if (!titleData) return null;

            const { type, title, season, episode, subtitle } = titleData;
            const titleParts = [title];
            if (type === "show") {
                titleParts.push(`S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`);
                if (subtitle) titleParts.push(subtitle);
            }
            return [titleParts.join(" "), title];
        },

        processMetadata(data) {
            if (!data || !data.video) return;
            const { type, title, seasons, id } = data.video;

            if (type === "show") {
                seasons.forEach(({ seq: season, episodes }) => {
                    episodes.forEach(({ id: episodeId, seq: episode, title: subtitle }) => {
                        this.titleCache[episodeId] = { type, title, season, episode, subtitle };
                    });
                });
            } else if (type === "movie") {
                this.titleCache[id] = { type, title };
            }

            if (title) {
                this.logCountMetadata++;
                console.log(`「${this.logCountMetadata}」从元数据更新 animeTitleBase: ${title}`);
                this.animeTitleBase = title;
                this.retryForFullTitle();
            }
        },

        updateAnimeTitle() {
            try {
                const newTitleInfo = this.getTitleFromCache();
                const newTitle = newTitleInfo ? newTitleInfo[0] : "Unknown Title";

                if (newTitle !== this.animeTitleEpisode) {
                    this.logCountFull++;
                    console.log(`[${this.logCountFull}] 更新 animeTitleEpisode 为: ${newTitle}`);
                    this.animeTitleEpisode = newTitle;

                    if (this.metadataRetryInterval) {
                        clearInterval(this.metadataRetryInterval);
                        this.metadataRetryInterval = null;
                        this.fullTitleRetryCount = 0;
                    }

                    if (newTitle && newTitle !== "Unknown Title") {
                        this.fetchAndDisplaySubtitles(newTitle);
                    }
                }
            } catch (e) {
                console.error("更新 animeTitleEpisode 失败:", e);
            }
        },

        async fetchAndDisplaySubtitles(title) {
            try {
                // 提取前两个字段作为 key（例如 "サマータイムレンダ S01E01"）
                const titleKey = title.split(" ").slice(0, 2).join(" ");

                console.log(`正在查询字幕标题键: ${titleKey}`);

                // 远程字幕 JSON 映射表地址
                const jsonUrl = "https://raw.githubusercontent.com/toarusaber/toaru/master/app/subtitles.json";
                const jsonRes = await fetch(jsonUrl);
                if (!jsonRes.ok) throw new Error(`字幕索引文件获取失败: HTTP ${jsonRes.status}`);

                const subtitleMap = await jsonRes.json();
                const subtitleUrl = subtitleMap[titleKey];

                if (!subtitleUrl) {
                    throw new Error(`未找到字幕地址: ${titleKey}`);
                }

                console.log(`尝试从 URL 获取字幕: ${subtitleUrl}`);
                const response = await fetch(subtitleUrl);
                if (!response.ok) throw new Error(`字幕文件获取失败: HTTP ${response.status}`);

                const srtContent = await response.text();

                // 使用 MutationObserver 确保元素加载后调用回调
                this.observeElement('#lln-main-subs', () => {
                    this.displaySubtitles(srtContent);
                });
            } catch (error) {
                console.error("字幕获取失败:", error);
            }
        },

        /**
        * 监听 DOM 变化，当目标元素加载时执行回调
        */
        observeElement(selector, callback) {
            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect(); // 停止观察
                    callback(); // 执行回调
                }
            });

            observer.observe(document.body, {
                childList: true, // 监听直接子节点的变化
                subtree: true,  // 监听所有后代节点的变化
            });
        },

        displaySubtitles(srtContent) {
            const subtitles = this.parseSRT(srtContent);

            // 确保 #misakitime 存在
let misakiTimeElem = document.getElementById('misakitime');
if (!misakiTimeElem) {
    misakiTimeElem = document.createElement('div');
    misakiTimeElem.id = 'misakitime';
    misakiTimeElem.className = 'toarutimetime';
    misakiTimeElem.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        font-size: 60px;
        color: red;
        z-index: 10000;
        display: none1;
    `;
    misakiTimeElem.textContent = '00:00:00,000'; // 初始化时间戳

    const llnMainSubsElem = document.getElementById('lln-main-subs');
    if (llnMainSubsElem) {
        llnMainSubsElem.appendChild(misakiTimeElem); // 添加到 #lln-main-subs
        console.log('已创建并添加 #misakitime');
    } else {
        console.error('未找到 #lln-main-subs，无法添加 #misakitime');
    }
}

            // 确保 #kurokotime 存在
let kurokotimeElem = document.getElementById('kurokotime');
if (!kurokotimeElem) {
    kurokotimeElem = document.createElement('div');
    kurokotimeElem.id = 'kurokotime';
    kurokotimeElem.className = 'misakamikototime';
    kurokotimeElem.style.cssText = `
        display: none1;
    `;
    //kurokotimeElem.textContent = '一番toarulinetimeとある'; // 示例内容
    const llnMainSubsElem = document.getElementById('lln-main-subs');
    if (llnMainSubsElem) {
        llnMainSubsElem.appendChild(kurokotimeElem); // 添加到 #lln-main-subs
        console.log('已创建并添加 #kurokotime');
    } else {
        console.error('未找到 #lln-main-subs，无法添加 #kurokotime');
    }
}



            // 确保 #snackbar 存在
let snackbarElem = document.getElementById('snackbar');
if (!snackbarElem) {
    snackbarElem = document.createElement('div');
    snackbarElem.id = 'snackbar';
    snackbarElem.style.cssText = `
        font-size: 16px;
        position: absolute;
        z-index: 1;
        color: white;
        bottom: 56px;
        text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;
        visibility: hidden;
    `;
    const kurokotimeElem = document.getElementById('kurokotime');
    if (kurokotimeElem) {
        kurokotimeElem.appendChild(snackbarElem); // 添加到 #kurokotime
        console.log('已创建并添加 #snackbar');
    } else {
        console.error('未找到 #kurokotime，无法添加 #snackbar');
    }
}



            // 确保 #custom-subtitle 存在
let subtitleElem = document.getElementById('custom-subtitle');
if (!subtitleElem) {
    subtitleElem = document.createElement('div');
    subtitleElem.id = 'custom-subtitle';
    subtitleElem.style.cssText = `
        width: 90%;
        text-align: center;
        font-size: 50px;
        font-weight: bold;
        text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;
        position: absolute;
        z-index: 1;
        color: white;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        visibility: hidden;
        bottom: -50px;
    `;
    const kurokotimeElem = document.getElementById('kurokotime');
    if (kurokotimeElem) {
        kurokotimeElem.appendChild(subtitleElem); // 添加到 #kurokotime
        console.log('已创建并添加 #custom-subtitle');
    } else {
        console.error('未找到 #kurokotime，无法添加 #custom-subtitle');
    }
}






            let currentIndex = 0;

            setInterval(() => {
                // 原始播放时间，单位为毫秒
                const now = this.getPlayerTime();
                const seconds = now / 1000; // 转换为秒

                // 将时间格式化为 00:00:00,000 格式
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0'); // 小时
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0'); // 分钟
    const sec = String(Math.floor(seconds % 60)).padStart(2, '0'); // 秒
    const milliseconds = String(Math.floor((seconds % 1) * 1000)).padStart(3, '0'); // 毫秒

    // 更新 'misakitime' 元素的内容
    const misakiTimeElem = document.getElementById('misakitime');
    if (misakiTimeElem) {
        misakiTimeElem.textContent = `${hours}:${minutes}:${sec},${milliseconds}`;
    }


                // 使用二分法查找当前时间的字幕索引
                const binarySearch = (target, arr) => {
                    let start = 0;
                    let end = arr.length - 1;

                    while (start <= end) {
                        const mid = Math.floor((start + end) / 2);

                        // 将 arr[mid].startTime 和 arr[mid].endTime 转换为毫秒
                        const startTimeMs = arr[mid].startTime * 1000;
                        const endTimeMs = arr[mid].endTime * 1000;

                        if (target >= startTimeMs && target <= endTimeMs) {
                            return mid; // 找到目标索引
                        } else if (target > endTimeMs) {
                            start = mid + 1; // 继续在右半部分搜索
                        } else {
                            end = mid - 1; // 继续在左半部分搜索
                        }
                    }

                    return -1; // 未找到
                };

                const currentSubtitleIndex = binarySearch(now, subtitles);

                if (currentSubtitleIndex !== -1) {
                    subtitleElem.textContent = subtitles[currentSubtitleIndex].text;
                    subtitleElem.style.visibility = "visible";
                } else {
                    subtitleElem.style.visibility = "hidden";
                }
            }, 500);
        },

        parseSRT(srtContent) {
            const lines = srtContent.split(/\r?\n/);
            const subtitles = [];
            let buffer = { startTime: 0, endTime: 0, text: "" };

            for (const line of lines) {
                if (/^\d+$/.test(line)) continue;
                const timeMatch = line.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
                if (timeMatch) {
                    buffer.startTime = this.parseTimeString(timeMatch[1]);
                    buffer.endTime = this.parseTimeString(timeMatch[2]);
                } else if (line.trim()) {
                    buffer.text += line + "\n";
                } else if (buffer.text) {
                    subtitles.push(buffer);
                    buffer = { startTime: 0, endTime: 0, text: "" };
                }
            }
            return subtitles;
        },

        parseTimeString(timeStr) {
            const parts = timeStr.split(/[:,]/);

            if (parts.length !== 4) {
                console.error("Invalid time format:", timeStr);
                return NaN;
            }

            const [hours, minutes, seconds, milliseconds] = parts.map(Number);

            if (
                isNaN(hours) ||
                isNaN(minutes) ||
                isNaN(seconds) ||
                isNaN(milliseconds)
            ) {
                console.error("Failed to parse time parts:", {
                    hours,
                    minutes,
                    seconds,
                    milliseconds,
                });
                return NaN;
            }

            return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
        },

        getPlayerTime() {
            try {
                const player = netflix.appContext.state.playerApp.getAPI().videoPlayer;
                const sessionId = player.getAllPlayerSessionIds().find((id) => id.includes("watch"));
                return player.getVideoPlayerBySessionId(sessionId).getCurrentTime();
            } catch (e) {
                console.error("无法获取播放器时间:", e);
                return 0;
            }
        },

        init() {
            this.injectScript(() => {
                window.getNetflixCache = () => netflix?.falcorCache || null;
            });

            window.addEventListener(
                "netflix_sub_downloader_data",
                (e) => e.detail.type === "metadata" && this.processMetadata(e.detail.data),
                false
            );

            const observer = new MutationObserver(() => {
                const newUrl = window.location.href;
                if (this.currentUrl !== newUrl) {
                    this.currentUrl = newUrl;
                    this.updateAnimeTitle();
                }
            });
            observer.observe(document, { subtree: true, childList: true });

            this.updateAnimeTitle();
            this.retryForFullTitle();
            console.log("Netflix AnimeTitle Updater 已初始化，并支持字幕功能。");
        },

        retryForFullTitle() {
            if (!this.metadataRetryInterval) {
                this.metadataRetryInterval = setInterval(() => {
                    if (this.fullTitleRetryCount >= this.MAX_FULL_TITLE_RETRIES) {
                        console.warn("获取完整标题的最大重试次数已达。");
                        clearInterval(this.metadataRetryInterval);
                        this.metadataRetryInterval = null;
                        return;
                    }
                    this.updateAnimeTitle();
                    this.fullTitleRetryCount++;
                }, 1000);
            }
        },

        getXFromCache(cache, name) {
            const id = this.getIdFromUrl();
            if (!id) return null;

            if (cache.hasOwnProperty(id)) return cache[id];

            try {
                const netflixCache = window.getNetflixCache?.();
                const newID = netflixCache?.videos[id]?.current?.value?.[1];
                if (newID && cache.hasOwnProperty(newID)) return cache[newID];
            } catch (e) {
                console.warn(`访问 falcorCache 时出错: ${e.message}`);
            }
            return null;
        },

        getIdFromUrl() {
            const id = window.location.pathname.split('/').pop();
            return /^\d+$/.test(id) ? id : null;
        },

        injectScript(fn) {
            const script = document.createElement("script");
            script.textContent = `(${fn.toString()})();`;
            document.head.appendChild(script);
            script.remove();
        }
    };

    NetflixUpdater.init();
})();
