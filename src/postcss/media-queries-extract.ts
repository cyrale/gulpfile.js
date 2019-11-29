import merge from "lodash/merge";
import postcss, { AtRule, ChildNode, ContainerBase } from "postcss";

interface Options {
  query: string;
}

/**
 * Extract media queries rules.
 */
export default postcss.plugin("media-queries-extract", (opts?: Options): ((css: ContainerBase) => void) => {
  const options: Options = merge({ query: "" }, opts || {});

  return (css: ContainerBase): void => {
    if (!options.query) {
      return;
    }

    const nodes: Array<ChildNode | ContainerBase> = [];

    css.walkAtRules("media", (node: AtRule): void => {
      if (options.query !== node.params) {
        return;
      }

      node.each((child: ChildNode) => {
        nodes.push(child.clone());
      });
    });

    css
      .removeAll()
      .append({ text: `media: ${options.query}` })
      .append(nodes);
  };
});
