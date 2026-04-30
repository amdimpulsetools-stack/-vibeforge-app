/**
 * Adapter mínimo HTML → @react-pdf/renderer.
 *
 * El editor TipTap del tab "Plantillas HC" produce HTML con un set
 * acotado de tags (p, strong, em, ul/ol/li, h1-h3, br). En lugar de
 * meter una dep como `react-pdf-html` (que añade ~150KB y trae más
 * complejidad de la que necesitamos), implementamos un mapper directo
 * sobre `html-react-parser`.
 *
 * Tags soportados:
 *   - p              → <Text> con salto inferior
 *   - strong / b     → <Text style={{ fontWeight: 'bold' }}>
 *   - em / i         → <Text style={{ fontStyle: 'italic' }}>
 *   - u              → <Text style={{ textDecoration: 'underline' }}>
 *   - h1 / h2 / h3   → <Text> con tamaño y peso
 *   - ul / ol        → <View> con items
 *   - li             → <View> con bullet (•) o número
 *   - br             → \n
 *
 * Tags no listados se renderizan como su contenido plano (sin perder texto).
 */

import { Text, View } from "@react-pdf/renderer";
import parse, {
  domToReact,
  Element,
  type DOMNode,
  type HTMLReactParserOptions,
} from "html-react-parser";
import type { ReactNode } from "react";

const PARAGRAPH_STYLE = { marginBottom: 4, lineHeight: 1.5 } as const;
const H1_STYLE = { fontSize: 16, fontWeight: "bold", marginBottom: 6, marginTop: 6 } as const;
const H2_STYLE = { fontSize: 14, fontWeight: "bold", marginBottom: 5, marginTop: 5 } as const;
const H3_STYLE = { fontSize: 12, fontWeight: "bold", marginBottom: 4, marginTop: 4 } as const;
const LIST_STYLE = { marginBottom: 4 } as const;
const LIST_ITEM_STYLE = { flexDirection: "row", marginBottom: 2 } as const;
const BULLET_STYLE = { width: 12 } as const;

function nodesToText(nodes: DOMNode[], opts: HTMLReactParserOptions): ReactNode {
  return domToReact(nodes, opts);
}

export function htmlToReactPdf(html: string): ReactNode {
  if (!html || !html.trim()) return null;

  let listIndex = 0;
  let listType: "ul" | "ol" = "ul";

  const opts: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (!(domNode instanceof Element)) return undefined;
      const tag = domNode.name.toLowerCase();
      const children = domNode.children as DOMNode[];

      switch (tag) {
        case "p":
          return <Text style={PARAGRAPH_STYLE}>{nodesToText(children, opts)}</Text>;

        case "strong":
        case "b":
          return (
            <Text style={{ fontWeight: "bold" }}>
              {nodesToText(children, opts)}
            </Text>
          );

        case "em":
        case "i":
          return (
            <Text style={{ fontStyle: "italic" }}>
              {nodesToText(children, opts)}
            </Text>
          );

        case "u":
          return (
            <Text style={{ textDecoration: "underline" }}>
              {nodesToText(children, opts)}
            </Text>
          );

        case "h1":
          return <Text style={H1_STYLE}>{nodesToText(children, opts)}</Text>;
        case "h2":
          return <Text style={H2_STYLE}>{nodesToText(children, opts)}</Text>;
        case "h3":
          return <Text style={H3_STYLE}>{nodesToText(children, opts)}</Text>;

        case "br":
          return <Text>{"\n"}</Text>;

        case "ul":
          listIndex = 0;
          listType = "ul";
          return <View style={LIST_STYLE}>{nodesToText(children, opts)}</View>;

        case "ol":
          listIndex = 0;
          listType = "ol";
          return <View style={LIST_STYLE}>{nodesToText(children, opts)}</View>;

        case "li": {
          listIndex += 1;
          const bullet = listType === "ul" ? "•" : `${listIndex}.`;
          return (
            <View style={LIST_ITEM_STYLE}>
              <Text style={BULLET_STYLE}>{bullet}</Text>
              <Text style={{ flex: 1 }}>{nodesToText(children, opts)}</Text>
            </View>
          );
        }

        // Tags no listados: dejamos pasar el contenido plano.
        default:
          return undefined;
      }
    },
  };

  return parse(html, opts);
}
