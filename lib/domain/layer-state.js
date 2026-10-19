"use strict";

// Serializable edit state. Renderer instances and event handlers belong elsewhere.
var LayerState = {
    styleKeys: ['color', 'fillColor', 'weight', 'opacity', 'fillOpacity', 'dashArray', 'lineCap', 'lineJoin'],
    visible(category) { return category?.opacity === '' || Number(category?.opacity ?? 1) > 0; },
    setVisibility(category, visible) { category.opacity = visible ? 1 : 0; },
    setWidth(category, width) { category.width = width; },
    applyPalette(categories, definition, darken) {
        for (const [key, style] of Object.entries(definition)) {
            const category = categories[key] ||= {};
            category.color = style.color;
            category.color_dark = style.color === '' ? '' : darken(style.color);
            category.width = style.width;
            category.opacity = style.opacity === undefined ? '' : style.opacity;
        }
    },
    editRecord({id, featureId, clickable, drawOrder, options}) {
        return { editorId:id, featureId, editorClickable:!!clickable,
            mapmaker:{drawOrder:drawOrder ? {...drawOrder} : undefined}, options:{...options} };
    },
    exportEdit(edit) {
        const options = {};
        for (const key of this.styleKeys) if (edit.options?.[key] !== undefined) options[key] = edit.options[key];
        return {...edit, mapmaker:{drawOrder:edit.mapmaker?.drawOrder ? {...edit.mapmaker.drawOrder} : undefined}, options};
    }
};
