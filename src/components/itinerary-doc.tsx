/* eslint-disable @next/next/no-img-element */
import { countryOf } from "@/lib/holidays";
import { dayDate, kindOf, mapsLink, type ClientItinerary } from "@/lib/itineraries";
import { PrintButton } from "./print-button";

const range = (start: string | null, days: number) => {
  if (!start || !days) return null;
  const a = dayDate(start, 1, { day: "numeric", month: "long" });
  const b = dayDate(start, days, { day: "numeric", month: "long", year: "numeric" });
  return days === 1 ? b : `${a} – ${b}`;
};

/** The traveller's itinerary: a branded web page that also prints as a PDF. No prices and no internal notes. */
export function ItineraryDoc({ it, preview = false }: { it: ClientItinerary; preview?: boolean }) {
  const when = range(it.start_date, it.days.length);
  const places = [...new Set(it.days.map((d) => d.city).filter(Boolean))] as string[];
  return (
    <article className="itn">
      <header className="itn-cover" style={it.cover_url ? { backgroundImage: `linear-gradient(180deg, rgba(11,11,10,.15) 0%, rgba(11,11,10,.78) 100%), url("${it.cover_url}")` } : undefined}>
        <div className="itn-top">
          <img src={it.cover_url ? "/brand/wordmark-white.png" : "/brand/lockup-black.png"} alt="sensus · dmc · mice · leisure" className="itn-logo" />
          <div className="itn-actions">{!preview && <PrintButton />}</div>
        </div>
        <div>
          <div className="itn-kicker">{it.client ? `Itinerary for ${it.client}` : "Your itinerary"}</div>
          <h1>{it.title}</h1>
          {it.subtitle && <p className="itn-sub">{it.subtitle}</p>}
          <div className="itn-facts">
            {when && <div><b>Dates</b>{when}</div>}
            <div><b>Duration</b>{it.days.length} {it.days.length === 1 ? "day" : "days"}</div>
            {it.pax ? <div><b>Travellers</b>{it.pax}</div> : null}
            {(places.length > 0 || it.destinations.length > 0) && <div><b>Destinations</b>{places.length ? places.slice(0, 5).join(" · ") : it.destinations.map((c) => countryOf(c)?.name ?? c).join(" · ")}</div>}
            {it.ref ? <div><b>Reference</b>{it.ref}</div> : null}
          </div>
        </div>
        {it.cover_credit && <span className="itn-credit">{it.cover_credit}</span>}
      </header>

      <div className="itn-body">
        {it.intro && <p className="itn-intro">{it.intro}</p>}

        {it.days.length > 1 && (
          <nav className="itn-index" aria-label="Days">
            {it.days.map((d) => (
              <a key={d.day} href={`#day-${d.day}`}><b>Day {d.day}</b>{dayDate(it.start_date, d.day, { day: "numeric", month: "short" }) || d.city || ""}</a>
            ))}
          </nav>
        )}

        {it.days.map((d) => (
          <section className="itn-day" id={`day-${d.day}`} key={d.day}>
            <div className="itn-dayhead">
              <div className="itn-daynum"><span>Day</span>{d.day}</div>
              <div>
                <div className="itn-daymeta">{[dayDate(it.start_date, d.day, { weekday: "long", day: "numeric", month: "long" }), d.city].filter(Boolean).join(" · ")}</div>
                <h2>{d.title || `Day ${d.day}`}</h2>
              </div>
            </div>
            {d.photo_url && (
              <figure className="itn-dayphoto"><img src={d.photo_url} alt={d.title || d.city || `Day ${d.day}`} loading="lazy" />{d.photo_credit && <figcaption>{d.photo_credit}</figcaption>}</figure>
            )}
            {d.description && <p className="itn-daydesc">{d.description}</p>}
            {d.items.length > 0 && (
              <ol className="itn-items">
                {d.items.map((x, i) => {
                  const k = kindOf(x.kind);
                  const place = [x.location, x.address].filter(Boolean).join(", ");
                  return (
                    <li key={i} className={`itn-item k-${k.id}`}>
                      <div className="itn-time">{x.start_time ?? ""}{x.end_time ? <span>– {x.end_time}</span> : null}</div>
                      <div className="itn-dot" aria-hidden>{k.icon}</div>
                      <div className="itn-card">
                        <div className="itn-kind">{k.label}</div>
                        <h3>{x.title}</h3>
                        {place && <a className="itn-place" href={mapsLink(place)} target="_blank" rel="noreferrer">📍 {place}</a>}
                        {x.description && <p>{x.description}</p>}
                        {(x.booking_ref || x.link_url) && (
                          <div className="itn-extra">
                            {x.booking_ref && <span><b>{x.kind === "flight" ? "Flight / booking" : "Confirmation"}</b> {x.booking_ref}</span>}
                            {x.link_url && <a href={x.link_url} target="_blank" rel="noreferrer">More information ↗</a>}
                          </div>
                        )}
                        {x.photo_url && <figure className="itn-photo"><img src={x.photo_url} alt={x.title} loading="lazy" />{x.photo_credit && <figcaption>{x.photo_credit}</figcaption>}</figure>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ))}

        {it.contacts && (
          <section className="itn-contacts">
            <h2>Contacts during your trip</h2>
            <p>{it.contacts}</p>
          </section>
        )}
      </div>
      <footer className="itn-foot">
        <img src="/brand/logo-black-on-yellow.png" alt="Sensus Travel DMC" />
        <span>Sensus Travel DMC · dmc · mice · leisure · <a href="https://sensustravel.com">sensustravel.com</a></span>
      </footer>
    </article>
  );
}
