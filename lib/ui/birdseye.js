// 主地図をMapLibreの3D表示へ切り替える。保存は同じカメラをSVGへ投影する。
const Birdseye = {
    open() {
        this.setEnabled(!map.threeD);
    },
    setEnabled(enabled) {
        map.threeD = enabled;
        // 3D化は建物の立体表示だけを切り替える。編集時の構図ロックは解除しない。
        if (mapMaker.customMode) MapCont.stop();
        map.schedule(); this.sync(); mapMaker.zoomMessage();
        mapMaker.queueExportPreview?.();
        if (mapMaker.rough_options().enabled) mapMaker.rough_change();
    },
    sync() {
        const toggle = document.getElementById('birdseyeEnabled');
        if (toggle) toggle.checked = !!map.threeD;
    },
    exportOptions(rect) {
        if (!map.cameraMatrix) throw new Error('Map camera is not ready');
        const size = map.getSize();
        return { camera: { matrix: [...map.cameraMatrix], width: size.x, height: size.y, rect, zoom: map.getZoom() },
            birdseye: map.threeD ? { ...Conf.default.birdseye, bearing: map.getBearing(), tilt: map.getPitch() } : null };
    }
};
