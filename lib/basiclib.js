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

    getdate() {							                // Overpass Queryに付ける日付指定
        let seldate = $("#Select_Date").val();
        return seldate ? '[date:"' + (new Date(seldate)).toISOString() + '"]' : "";
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
            $.ajax({
                url: encurl,
                dataType: "json",
                timeout: 10000
            }).done(function (data) {
                resolve([data.extract || "", data.thumbnail]);
            }).fail(function (jqXHR, statusText, errorThrown) {
                console.log(`getWikipedia failed: ${statusText}`, errorThrown);
                reject({ jqXHR, statusText, errorThrown });
            });
        });
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
