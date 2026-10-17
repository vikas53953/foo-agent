// foo's own lint rules (foo-plan §3, 08-0 §C.4, §D, 02-3 §F29, 11-fidelity FID-20).
const isTestFile = (f) => /[\\/]test[\\/]/.test(f);

/** foo/no-literal-copy: user-visible words come from t(key) (08-0 §D). */
const noLiteralCopy = {
  meta: { type: 'problem', messages: { literal: 'User-visible text must come from t(key) (08-0 §D): "{{text}}"' }, schema: [] },
  create(context) {
    const VISIBLE_ATTRS = new Set(['title', 'placeholder', 'alt', 'aria-label', 'aria-description', 'label']);
    return {
      JSXText(node) {
        const text = node.value.trim();
        if (/\p{L}/u.test(text)) context.report({ node, messageId: 'literal', data: { text } });
      },
      JSXAttribute(node) {
        if (!VISIBLE_ATTRS.has(node.name.name)) return;
        const v = node.value;
        if (v && v.type === 'Literal' && typeof v.value === 'string' && /\p{L}/u.test(v.value)) {
          context.report({ node, messageId: 'literal', data: { text: v.value } });
        }
      },
    };
  },
};

/** foo/testid-from-registry: data-testid values come from TID (08-0 §C.4). */
const testidFromRegistry = {
  meta: { type: 'problem', messages: { literal: 'data-testid must be TID.* from src/shared/testids.ts (08-0 §C.4)' }, schema: [] },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'data-testid' || !node.value) return;
        const v = node.value;
        const expr = v.type === 'JSXExpressionContainer' ? v.expression : v;
        const ok = expr.type === 'MemberExpression' && expr.object.type === 'Identifier' && expr.object.name === 'TID';
        if (!ok) context.report({ node, messageId: 'literal' });
      },
    };
  },
};

/** foo/no-raw-design-values: no hex colours, px or ms literals in components (Article 24, 02-3 §F29). */
const noRawDesignValues = {
  meta: { type: 'problem', messages: { raw: 'Raw design value "{{v}}": use a token (Article 24)' }, schema: [] },
  create(context) {
    const RAW = /^#[0-9a-f]{3,8}$|\b\d+(\.\d+)?(px|ms)\b|\brgba?\(/i;
    return {
      Literal(node) {
        if (typeof node.value === 'string' && RAW.test(node.value) && !/^(0|1px|1\.5px)$/.test(node.value)) {
          context.report({ node, messageId: 'raw', data: { v: node.value } });
        }
      },
    };
  },
};

/** foo/spec-header: every source file opens with a comment naming the spec section it implements (FID-20). */
const specHeader = {
  meta: {
    type: 'suggestion',
    messages: { missing: 'Start the file with a comment naming its spec section, e.g. "// Spec: 03-shell-1 §3.2"' },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        if (isTestFile(context.filename) || context.filename.endsWith('.d.ts')) return;
        const first = context.sourceCode.getAllComments()[0];
        if (!first || first.range[0] > 0 || !/Spec:|spec\b|§|\b0\d-[a-z]/i.test(first.value))
          context.report({ node, messageId: 'missing' });
      },
    };
  },
};

module.exports = {
  rules: {
    'no-literal-copy': noLiteralCopy,
    'testid-from-registry': testidFromRegistry,
    'no-raw-design-values': noRawDesignValues,
    'spec-header': specHeader,
  },
};
