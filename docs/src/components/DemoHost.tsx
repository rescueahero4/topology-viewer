import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { darkTokens, useSiteTheme } from "./siteTheme";

const modules = import.meta.glob<{ default: ComponentType }>("../demos/*.tsx");
const loaded = new Map<string, ComponentType>();

// A demo file is loaded only on the page that shows it.
function demoOf(name: string): ComponentType {
  let made = loaded.get(name);
  if (made === undefined) {
    const load = modules[`../demos/${name}.tsx`];
    if (load === undefined) throw new Error(`No demo named "${name}"`);
    made = lazy(load);
    loaded.set(name, made);
  }
  return made;
}

class Guard extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    const { error } = this.state;
    if (error !== null)
      return <p className="tv-demo-error">This demo failed: {error.message}</p>;
    return this.props.children;
  }
}

export default function DemoHost({ name, height }: { name: string; height: number }) {
  const theme = useSiteTheme();
  const Demo = demoOf(name);
  const style = (theme === "dark" ? darkTokens : {}) as CSSProperties;
  // A new theme makes a new viewer, so the contrast check reads the new canvas colour.
  return (
    <div key={theme} style={style}>
      <Guard>
        <Suspense
          fallback={
            <div className="tv-demo-loading" style={{ height }}>
              Loading the demo…
            </div>
          }
        >
          <Demo />
        </Suspense>
      </Guard>
    </div>
  );
}
