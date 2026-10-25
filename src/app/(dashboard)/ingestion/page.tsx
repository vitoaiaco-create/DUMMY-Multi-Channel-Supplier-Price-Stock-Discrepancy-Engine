import { DataUploader } from "@/components/ingestion/data-uploader";

export default function IngestionPage() {
  return (
    <section className="w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          AI-Assisted Universal Data Ingestion
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Upload supplier files, invoices, and inventory feeds. The engine maps
          columns, normalizes SKUs, and stages records for True Landed Cost.
        </p>
      </div>
      <DataUploader />
    </section>
  );
}
