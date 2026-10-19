"use strict";

MapMakerDomain.matches3DCondition = function(feature, condition) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
    const keys = Object.keys(condition);
    for (const op of ['all', 'any', 'not']) {
        if (!Object.hasOwn(condition, op)) continue;
        if (keys.length !== 1) return false;
        if (op === 'not') return MapMakerDomain.matches3DConditionValid(condition.not) && !MapMakerDomain.matches3DCondition(feature, condition.not);
        const items = condition[op];
        if (!Array.isArray(items) || !items.length || !items.every(MapMakerDomain.matches3DConditionValid)) return false;
        return op === 'all' ? items.every(item => MapMakerDomain.matches3DCondition(feature, item))
            : items.some(item => MapMakerDomain.matches3DCondition(feature, item));
    }
    if (!MapMakerDomain.matches3DConditionValid(condition)) return false;
    const tags = condition.tags ?? [condition.tag];
    const normalize = value => String(value).trim().toLowerCase();
    return tags.some(tag => {
        const raw = MapMakerDomain.featureTag(feature, tag);
        const present = raw != null && String(raw).trim() !== '';
        if (condition.exists !== undefined && present !== condition.exists) return false;
        const hasValues = condition.values !== undefined, hasPatterns = condition.patterns !== undefined;
        if (!hasValues && !hasPatterns) return true;
        if (!present) return false;
        const value = normalize(raw);
        return (condition.values ?? []).some(candidate => normalize(candidate) === value) ||
            (condition.patterns ?? []).some(pattern => {
                try { return new RegExp(pattern, 'i').test(value); } catch { return false; }
            });
    });
};

MapMakerDomain.matches3DConditionValid = function(condition) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
    const keys = Object.keys(condition);
    for (const op of ['all', 'any', 'not']) {
        if (!Object.hasOwn(condition, op)) continue;
        return keys.length === 1 && (op === 'not' ? MapMakerDomain.matches3DConditionValid(condition.not)
            : Array.isArray(condition[op]) && condition[op].length > 0 && condition[op].every(MapMakerDomain.matches3DConditionValid));
    }
    const tags = condition.tags ?? [condition.tag];
    return keys.every(key => ['tag', 'tags', 'values', 'patterns', 'exists'].includes(key)) &&
        !(condition.tag !== undefined && condition.tags !== undefined) &&
        Array.isArray(tags) && tags.length > 0 && tags.every(tag => typeof tag === 'string' && tag.length > 0) &&
        (condition.exists === undefined || typeof condition.exists === 'boolean') &&
        (condition.values === undefined || Array.isArray(condition.values) && condition.values.every(value => typeof value === 'string')) &&
        (condition.patterns === undefined || Array.isArray(condition.patterns) && condition.patterns.every(value => typeof value === 'string')) &&
        (condition.exists !== undefined || condition.values !== undefined || condition.patterns !== undefined);
};

MapMakerDomain.model3D = function(context, feature, family) {
    // Supported model names are renderer capabilities, not arbitrary file paths.
    const supported = { tree: ['cone', 'cherry', 'ginkgo'], roof: ['flat', 'gabled', 'hipped', 'pyramidal'], barrier: ['flat', 'wall', 'hedge', 'fence', 'rope'] };
    if (!Object.hasOwn(supported, family)) return null;
    const fallback = { tree: 'cone', roof: 'flat', barrier: 'flat' }[family];
    let config = context.config.model3D?.[family];
    if (!config) {
        // Keep older configurations and standalone consumers working.
        if (family === 'tree') {
            const old = context.config.pointStyle?.tree ?? {};
            config = { rules: (old.shapeRules ?? []).map(rule => ({ model: rule.shape,
                when: { tags: old.shapeTags ?? [], values: rule.values ?? [], patterns: rule.patterns ?? [] } })) };
        } else {
            const tag = family === 'roof' ? 'roof:shape' : 'barrier';
            config = { rules: supported[family].filter(model => model !== 'flat').map(model => ({ model, when: { tag, values: [model] } })) };
        }
    }
    for (const rule of Array.isArray(config.rules) ? config.rules : []) {
        if (rule && supported[family].includes(rule.model) && MapMakerDomain.matches3DCondition(feature, rule.when)) return rule.model;
    }
    return supported[family].includes(config.defaultModel) ? config.defaultModel : fallback;
};
