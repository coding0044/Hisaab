import { useEffect, useState, type ReactNode } from "react";
import { FileText, ImageOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_LABEL, signedProofUrl, type Proof } from "@/lib/ledger";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  partially_paid: "bg-primary/10 text-primary border-primary/25",
  awaiting_confirmation: "bg-chart-3/15 text-foreground border-chart-3/30",
  settled: "bg-success/15 text-success border-success/30",
  confirmed: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", STATUS_STYLE[s])}>
      {STATUS_LABEL[s] ?? s}
    </Badge>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ProofPreview({ proof }: { proof: Proof }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);
  const isPdf = proof.mime_type === "application/pdf";
  useEffect(() => {
    let alive = true;
    signedProofUrl(proof.storage_path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [proof.storage_path]);

  if (err)
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-lg border text-muted-foreground">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  if (!url)
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-lg border">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  if (isPdf)
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border text-xs hover:bg-secondary">
        <FileText className="h-6 w-6" /> PDF
      </a>
    );
  return (
    <>
      <button onClick={() => setOpen(true)} className="overflow-hidden rounded-lg border" aria-label="View proof">
        <img src={url} alt={proof.file_name ?? "Proof"} className="h-20 w-20 object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{proof.file_name ?? "Proof"}</DialogTitle>
          </DialogHeader>
          <img src={url} alt={proof.file_name ?? "Proof"} className="max-h-[75vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FilePick({ file, onChange, id }: { file: File | null; onChange: (f: File | null) => void; id: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
      />
      {file && (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-muted-foreground hover:text-foreground">
          Remove
        </button>
      )}
    </div>
  );
}
