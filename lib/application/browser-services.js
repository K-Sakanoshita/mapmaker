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
            // PNG retains transparency in icon fallbacks and embedded images.
            callback(canvas.toDataURL('image/png'));
        };
        image.src = src;
    }

    getdate() {							                // Overpass Queryに付ける日付指定
        let seldate = $("#Select_Date").val();
        return seldate ? '[date:"' + (new Date(seldate)).toISOString() + '"]' : "";
    }

    retryAfterMs(error) {
        const header = error?.jqXHR?.getResponseHeader?.('Retry-After');
        if (header) {
            const value = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
            if (Number.isFinite(value)) return Math.max(0, value);
        }
        // Do not immediately repeat a rate-limited request without a server hint.
        return error?.status === 429 || error?.code === 'OVERPASS_RATE_LIMIT' ? 30000 : 0;
    }

    async retry(func, retryCount, { delayMs = 1000, maxDelayMs = 5000, onRetry } = {}) {
        // retryCount counts additional attempts; Overpass callers use two full server rounds.
        for (let attempt = 0; ; attempt++) {
            try { return await func(); }
            catch (error) {
                if (attempt >= retryCount || error?.retryable === false || error?.statusText === 'abort') throw error;
                const retryAfter = this.retryAfterMs(error);
                // A longer server-requested pause needs an explicit later retry, not an early request.
                if (retryAfter > maxDelayMs) throw error;
                const delay = retryAfter > 0 ? retryAfter : Math.min(delayMs * 2 ** attempt, maxDelayMs);
                const notice = {attempt:attempt + 1, total:retryCount, delayMs:delay, error};
                await onRetry?.({...notice, waiting:true});
                await new Promise(resolve => setTimeout(resolve, delay));
                await onRetry?.({...notice, waiting:false});
            }
        }
    }

    getWikipedia(lang, url) {      // get wikipedia contents
        return new Promise((resolve, reject) => {
            if (!/^[a-z][a-z0-9-]{0,31}$/.test(lang)) return reject(Object.assign(new Error('Invalid Wikipedia language'), {retryable:false}));
            let encurl = encodeURIComponent(url);
            encurl = "https://" + lang + "." + Conf.osm.wikipedia.api + encurl + "?origin=*";
            console.log(encurl);
            $.ajax({
                url: encurl,
                dataType: "json",
                timeout: 30000
            }).done(function (data) {
                resolve([data.extract || "", data.thumbnail]);
            }).fail(function (jqXHR, statusText, errorThrown) {
                console.log(`getWikipedia failed: ${statusText}`, errorThrown);
                const status = jqXHR.status || 0;
                const code = status === 429 ? 'REQUEST_RATE_LIMIT' : status === 404 ? 'REQUEST_NOT_FOUND' : 'REQUEST_FAILED';
                reject({ jqXHR, statusText, errorThrown, status, code,
                    retryable:statusText !== 'abort' && statusText !== 'parsererror' &&
                        (status === 0 || status === 408 || status === 429 || status >= 500) });
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
