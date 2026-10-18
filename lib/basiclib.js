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

    async retry(func, retryCount, { delayMs = 1000, maxDelayMs = 5000 } = {}) {
        // retryCount counts additional attempts; Overpass callers use two full server rounds.
        for (let attempt = 0; ; attempt++) {
            try { return await func(); }
            catch (error) {
                if (attempt >= retryCount || error?.retryable === false || error?.statusText === 'abort') throw error;
                const header = error?.jqXHR?.getResponseHeader?.('Retry-After');
                const retryAfter = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
                // A longer server-requested pause needs an explicit later retry, not an early request.
                if (retryAfter > maxDelayMs) throw error;
                const delay = retryAfter > 0 ? retryAfter : Math.min(delayMs * 2 ** attempt, maxDelayMs);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    getWikipedia(lang, url) {      // get wikipedia contents
        return new Promise((resolve, reject) => {
            if (!/^[a-z][a-z0-9-]{0,31}$/.test(lang)) return reject(new Error('Invalid Wikipedia language'));
            let encurl = encodeURIComponent(url);
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
