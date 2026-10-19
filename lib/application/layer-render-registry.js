"use strict";

// Runtime handles are keyed by the plain category object and never sent to Workers.
var LayerRenderRegistry = {
    entries: new WeakMap(),
    get(category) {
        if (!category) return [];
        // Compatibility for integrations still supplying old-style layer fixtures.
        return category.svg || this.entries.get(category) || [];
    },
    set(category, models) {
        this.entries.set(category, models);
        category.edits = models.map(model => {
            const edit = LayerState.editRecord({id:model.id, featureId:model.mapmaker?.sourceFeature?.id ?? model.feature?.id,
                clickable:typeof model.click === 'function', drawOrder:model.mapmaker?.drawOrder, options:model.options});
            // Existing setStyle callers now edit the plain state record directly.
            Object.defineProperty(model, 'options', {configurable:true, enumerable:true,
                get:() => edit.options, set:value => { edit.options = value; }});
            return edit;
        });
    }
};
