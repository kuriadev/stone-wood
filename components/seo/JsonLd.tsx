/** Renders schema.org data as JSON-LD. Server Component: the JSON ships in
 *  the HTML and costs no client JavaScript.
 *
 *  `<` is escaped so a value containing "</script>" cannot end the tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
