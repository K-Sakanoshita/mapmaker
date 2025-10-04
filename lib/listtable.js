
// PoiDatalist管理
var DataList = (function () {
    var table, _status = "", _lock = false, timeout = 0, MS = "modal_select";

    return {
        status: () => { return _status },   // statusを返す
        table: () => { return table },      // tableを返す
        lock: mode => { _lock = mode },     // DataListをロック(true) or 解除(false)とする
        init: () => { // DataListに必要な初期化
            $(`#${MS}_keyword`).off();
            $(`#${MS}_keyword`).on('change', () => {        // キーワード検索
                if (timeout > 0) {
                    window.clearTimeout(timeout);
                    timeout = 0;
                };
                timeout = window.setTimeout(() => DataList.filter($(`#${MS}_keyword`).val(), 500));
            });

            $(`#${MS}_category`).off();
            $(`#${MS}_category`).on('change', () => {        // カテゴリ名でキーワード検索
                let category = $(`#${MS}_category`).val();
                DataList.filter(category == "-" ? "" : category);
            });
        },
        make_select: result => {    		// 店舗種別リストを作成
            winCont.select_clear(`${MS}_category`);
            let pois = result.map(data => { return data.category });
            pois = pois.filter((x, i, self) => { return self.indexOf(x) === i });
            pois.sort((x, y) => x.localeCompare(y, 'ja'));
            pois.map(poi => winCont.select_add(`${MS}_category`, poi, poi));
        },
        view_select: function (targets) {  	// PoiDataのリスト表示
            DataList.lock(true);
            if (table !== undefined) table.destroy();
            let result = poiCont.list(targets);
            table = $('#modal_select_table').DataTable({
                "columns": Object.keys(Conf.datatables_columns).map(function (key) { return Conf.datatables_columns[key] }),
                "data": result,
                "processing": true,
                "filter": true,
                "destroy": true,
                "deferRender": true,
                "dom": 't',
                "language": Conf.datatables_lang,
                "order": [],    // ソート禁止(行選択時にズレが生じる)
                "ordering": true,
                "orderClasses": false,
                "paging": true,
                "processing": false,
                "pageLength": 100000,
                "select": 'multi',
                "scrollCollapse": true,
            });
            $('#modal_select_table').css("width", "");
            DataList.make_select(result);
            let osmids = result.filter(val => val.enable).map(val => val.osmid);
            DataList.one_select(osmids);
            table.draw();
            table.off('select');
            table.on('select', (e, dt, type, indexes) => {
                if (type === 'row') {
                    var data = table.rows(indexes).data().pluck('osmid');
                    Marker.center(data[0]);
                }
            });
            DataList.lock(false);
        },
        one_select: osmids => {
            let alldata = table.rows().data().toArray();
            let join_ids = osmids.join('|');
            alldata.forEach((val, idx) => { if (join_ids.indexOf(val.osmid) > -1) table.row(idx).select() });
        },
        indexes: () => { // アイコンをクリックした時にデータを選択
            let selects = table.rows('.selected').indexes();
            selects = table.rows(selects).data();
            return selects.toArray();
        },
        filter: keyword => { table.search(keyword).draw() },                // キーワード検索
        filtered: () => table.rows({ filter: 'applied' }).data().toArray(), // 現在の検索結果リスト
        filtered_select: () => table.rows({ filter: 'applied' }).select(),
        filtered_deselect: () => table.rows({ filter: 'applied' }).deselect()
    }
})();
