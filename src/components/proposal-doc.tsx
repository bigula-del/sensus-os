import { money } from "@/lib/format";

/** Client-facing proposal content. Contains NO cost, margin or supplier fields by design. */
export type ClientProposal = {
  title: string;
  client: string | null;
  dates: string | null;
  pax: number;
  version: number;
  currency: string;
  valid_until: string | null;
  single_supplement: number | null;
  intro: string | null;
  total: number;
  days: { day: number; title: string; items: { service: string; description: string | null }[] }[];
};

export function ProposalDoc({ p }: { p: ClientProposal }) {
  const perPerson = p.pax ? p.total / p.pax : 0;
  return (
    <article className="doc">
      <header className="cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-black.png" alt="sensus · dmc · mice · leisure" />
        <div>
          <div className="kicker">Proposal{p.client ? ` for ${p.client}` : ""}</div>
          <h2>{p.title.replace(" · ", " — ")}</h2>
        </div>
        <div className="facts">
          {p.dates && <div><b>Dates</b>{p.dates}</div>}
          <div><b>Group</b>{p.pax} participants</div>
          <div><b>Duration</b>{p.days.length} {p.days.length === 1 ? "day" : "days"}</div>
          <div><b>Version</b>{p.version}</div>
        </div>
      </header>
      <div className="docbody">
        {p.intro && <p style={{ margin: 0, maxWidth: "65ch", whiteSpace: "pre-wrap" }}>{p.intro}</p>}
        <section>
          <h3>Your programme</h3>
          {p.days.map((d) => (
            <div className="dday" key={d.day}>
              <div className="n">Day {d.day}<span>{d.title}</span></div>
              <ul>
                {d.items.map((it, i) => (
                  <li key={i}><b>{it.service}</b>{it.description && <p>{it.description}</p>}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="invest">
          <div>
            <small>Investment per person</small>
            <div className="pp">{money(perPerson, p.currency)}</div>
            <small style={{ marginTop: 6 }}>sharing a double room</small>
          </div>
          <div style={{ textAlign: "right" }}>
            <small>Total for {p.pax} participants</small>
            <div style={{ font: "600 22px/1.2 var(--display)" }}>{money(p.total, p.currency)}</div>
            {p.single_supplement ? <small style={{ marginTop: 6 }}>Single supplement {money(p.single_supplement, p.currency)} per person</small> : null}
          </div>
        </section>
        <section className="terms">
          <div><h4>Included</h4><ul><li>All services listed in the programme</li><li>Sensus host on site throughout</li><li>24/7 assistance during the programme</li></ul></div>
          <div><h4>Conditions</h4><ul>
            <li>Prices in {p.currency}{p.valid_until ? `, valid until ${new Date(p.valid_until + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}</li>
            <li>Based on {p.pax} participants; subject to availability at confirmation</li>
            <li>Payment schedule sent with the pro-forma</li>
          </ul></div>
        </section>
      </div>
      <footer className="docfoot">
        <span><b>Sensus Travel DMC</b></span><span>SENSO VIAJANTE - VIAGENS UNIPESSOAL LDA</span><span>NIF PT518035042</span>
        <span>Av. Duque de Loulé 110, Lisboa, Portugal</span><span>+351 300 305 263</span><span>info@sensustravel.com</span><span>sensustravel.com</span>
      </footer>
    </article>
  );
}
