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
      if (node.type === "atrule" && node.name === "critical") {
        if (options.keepRules) {
          node.each((child: ChildNode) => {
            node.after(child.clone());
          });
        }

        node.remove();
      }

      if (node.type === "decl" && node.prop === "critical" && node.value === "this") {
        if (options.keepRules) {
          node.remove();
        } else {
          node.parent.remove();
        }
      }
    });
  };
});
