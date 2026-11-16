export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="c-skel mb-2 h-7 w-56" />
      <div className="c-skel mb-6 h-4 w-80" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="c-skel h-[118px] rounded-[14px]" />)}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="c-skel h-[320px] rounded-[14px] xl:col-span-2" />
        <div className="c-skel h-[320px] rounded-[14px]" />
      </div>
    </div>
  );
}
