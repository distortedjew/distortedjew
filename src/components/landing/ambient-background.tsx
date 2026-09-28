export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] animate-drift" />
      <div className="absolute top-1/3 -right-40 h-[420px] w-[420px] rounded-full bg-secondary/20 blur-[120px] animate-drift [animation-delay:-6s]" />
      <div className="absolute bottom-0 left-[-10%] h-[380px] w-[380px] rounded-full bg-primary/10 blur-[100px] animate-drift [animation-delay:-11s]" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
    </div>
  );
}
