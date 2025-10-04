// Basic Closure
class BasicLib {

    ImageToBase64(src, callback) {
        var image = new Image();
        image.crossOrigin = 'Anonymous';
        image.onload = function () {
            var canvas = document.createElement('canvas');
            var context = canvas.getContext('2d');
            canvas.height = this.naturalHeight;
            canvas.width = this.naturalWidth;
            context.drawImage(this, 0, 0);
            callback(canvas.toDataURL('image/jpeg'));
        };
        image.src = src;
    }

    code2rgb(colorCode) {                                           // カラーコード(#RRGGBB)を返す
        return String(colorCode.slice(1).match(/.{2}/g).map(hex => parseInt(hex, 16)));
    }

    rgb2code(rgb) {
        return "#" + rgb.map(function (value) {
            return ("0" + value.toString(16)).slice(-2);
        }).join("");
    }

    getdate() {							                // Overpass Queryに付ける日付指定
        let seldate = $("#Select_Date").val();
        return seldate ? '[date:"' + (new Date(seldate)).toISOString() + '"]' : "";
    }

    dataURItoBlob(dataURI, type) {                               // DataURIからBlobへ変換（ファイルサイズ2MB超過対応）
        const b64 = atob(dataURI.split(',')[1]);
        const u8 = Uint8Array.from(b64.split(""), function (e) { return e.charCodeAt() });
        return new Blob([u8], { "type": type });
    }

    concatTwoDimensionalArray(array1, array2, axis) {      // 2次元配列の合成
        if (axis != 1) axis = 0;
        var array3 = [];
        if (axis == 0) {    //　縦方向の結合
            array3 = array1.slice();
            for (var i = 0; i < array2.length; i++) {
                array3.push(array2[i]);
            }
        }
        else {              //　横方向の結合
            for (var i = 0; i < array1.length; i++) {
                array3[i] = array1[i].concat(array2[i]);
            }
        }
        return array3;
    }

    unicodeUnescape(str) {     // \uxxx形式→文字列変換
        let result = "", strs = str.match(/\\u.{4}/ig);
        if (!strs) return '';
        for (var i = 0, len = strs.length; i < len; i++) {
            result += String.fromCharCode(strs[i].replace('\\u', '0x'));
        };
        return result;
    }

    retry(func, retryCount) {   // Promise失敗時にリトライする
        let promise = func();
        for (let i = 1; i <= retryCount; ++i) {
            promise = promise.catch(func);
        }
        return promise;
    }

    getWikipedia(lang, url) {      // get wikipedia contents
        return new Promise((resolve, reject) => {
            let encurl = encodeURI(url);
            encurl = "https://" + lang + "." + Conf.osm.wikipedia.api + encurl + "?origin=*";
            console.log(encurl);
            $.get({ url: encurl, dataType: "json" }, function (data) {
                console.log(data.extract);
                resolve([data.extract, data.thumbnail]);
                // let key = Object.keys(data.query.pages);
                // let text = data.query.pages[key].extract;
                // console.log(text);
                // resolve(text);
            });
        });
    }
    isSmartPhone() {
        if (window.matchMedia && window.matchMedia('(max-device-width: 640px)').matches) {
            return true;
        } else {
            return false;
        }
    }
    getBrowserName() {
        const agent = window.navigator.userAgent.toLowerCase()
        let browser = "";
        if (agent.indexOf("edg") != -1 || agent.indexOf("edge") != -1) {
            browser = "Edge";
        } else if (agent.indexOf("opr") != -1 || agent.indexOf("opera") != -1) {
            browser = "Opera";
        } else if (agent.indexOf("chrome") != -1) {
            browser = "Chrome";
        } else if (agent.indexOf("safari") != -1) {
            browser = "Safari";
        } else if (agent.indexOf("firefox") != -1) {
            browser = "FireFox";
        } else if (agent.indexOf("opr") != -1 || agent.indexOf("opera") != -1) {
            browser = "Opera";
        }
        return browser;
    }

    async getData(URL) {        // 指定したURLを読み込む
        try {
            console.log("getData: " + URL)
            const response = await fetch(URL);
            if (!response.ok) {
                throw new Error(`Error: ${response.status}`);
            }
            const json = await response.json();
            console.log(json);
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }
}
var Basic = new BasicLib();
