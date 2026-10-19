"use strict";

// Engine-independent coordinate helpers; bounds are explicit inputs.
const CoordinateGeometry = {

    bboxclip(cords, LL) { // geojsonは[経度lng,緯度lat]
        let new_cords = cords.filter((cord) => {
            return !((cord[0] < (LL.NW.lng)) || (cord[0] > (LL.SE.lng)) || (cord[1] < (LL.SE.lat)) || (cord[1] > (LL.NW.lat)))
        })
        return new_cords;
    },

    multi2flat(cords, type) {     // 代表点計算用に座標を平坦化する。Pointは座標対、その他は座標列の配列を返す。
        let flats;
        switch (type) {
            case "Point":
                flats = cords;
                break;
            case "LineString":
                flats = [cords];
                break;
            case "MultiPolygon":
                flats = cords.flat();
                break;
            default:
                flats = [cords.flat()];
                break;
        }
        return flats;
    },

    flat2single(cords, type) {
        // type: "Point" | "LineString" | "Polygon" | "MultiPolygon" などを想定
        // cords は multi2flat() 後の形式を想定しているため、
        // Point以外は cords[0] が「座標配列」になっているケースが多い
        if (type === "Point") {
            // Point は [lng, lat]
            return [cords[0], cords[1]];
        }

        // Point以外： cords[0] が [ [lng,lat], [lng,lat], ... ] を想定
        const ring = cords[0];
        if (!Array.isArray(ring) || ring.length === 0) {
            // 異常系：とりあえず [0,0]
            return [0, 0];
        }

        let sumLng = 0;
        let sumLat = 0;
        const n = ring.length;

        for (let i = 0; i < n; i++) {
            sumLng += Number(ring[i][0]);
            sumLat += Number(ring[i][1]);
        }

        return [sumLng / n, sumLat / n];
    }
};
