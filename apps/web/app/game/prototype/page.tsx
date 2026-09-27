import { Suspense } from "react";
import { GamePrototype } from "./prototype";

// Three throwaway Game room layouts, switchable via ?variant=3, ?variant=2, or ?variant=4.
export default function PrototypePage() {
  return (
    <Suspense fallback={<p>Loading prototype…</p>}>
      <GamePrototype />
    </Suspense>
  );
}
