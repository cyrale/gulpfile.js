import merge from "lodash/merge";
import postcss, { ChildNode, ContainerBase } from "postcss";

interface Options {
  keepRules: boolean;
}

/**
 * Extract critical rules.
 */
export default postcss.plugin("critical-clean", (opts?: Options): ((css: ContainerBase) => void) => {
  const options: Options = merge({ keepRules: false }, opts || {});

  return (css: ContainerBase): void => {
    css.walk((node: ChildNode): void => {
      // Treat `@critical` nodes.
      if (node.type === "atrule" && node.name === "critical") {
        // Keep children by adding them after.
        if (options.keepRules) {
          node.each((child: ChildNode) => {
            node.after(child.clone());
          });
        }

        // Remove current node.
        node.remove();
      }

      // Treat `critical: this` nodes.
      if (node.type === "decl" && node.prop === "critical" && node.value === "this") {
        if (options.keepRules) {
          // Remove current nodes.
          node.remove();
        } else {
          // Remove node that include current.
          node.parent.remove();
        }
      }
    });
  };
});
