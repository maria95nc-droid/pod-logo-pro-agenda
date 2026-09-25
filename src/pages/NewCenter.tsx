import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateAll, useVisits } from "@/hooks/useData";
import { PAYMENT_METHODS } from "@/types";
import { countCompletedVisits } from "@/lib/centers";
import { INCOME_TYPES, INCOME_TYPE_HINT, INCOME_TYPE_LABEL, normalizeIncomeType } from "@/lib/fiscalCalculations";
import {
  MAX_FREQUENCY_WEEKS,
  MIN_FREQUENCY_WEEKS,
  VISIT_FREQUENCY_PRESETS,
  frequencyLabel,
  leadDaysFor,
  normalizeFrequencyWeeks,
  weeksText,
} from "@/lib/visitReminders";

const TYPES = ["Residencia", "Centro de día", "Domicilio", "Clínica propia", "Otro"] as const;

/** Opciones no numéricas del desplegable de cadencia. */
const NO_CADENCE = "none";
const CUSTOM_CADENCE = "custom";

/**
 * Valor del desplegable «quién paga» cuando no hay respuesta habitual: la app
 * preguntará en cada visita en vez de suponerla.
 */
const ASK_PAYER = "ask";

/**
 * Horas de llegada más habituales: David sólo tiene que tocar una («algunos a
 * las 9, otros a las 11»). El campo sigue siendo libre porque `usual_schedule`
 * es texto y hay centros con horarios escritos a mano.
 */
const COMMON_START_TIMES = ["9:00", "10:00", "11:00", "16:00"] as const;

export default function NewCenter() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Residencia");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [email, setEmail] = useState("");
  const [usualSchedule, setUsualSchedule] = useState("");
  // Cadencia numérica (`visit_frequency_weeks`): es la que usa la app para
  // avisar de que toca llamar, y la que se pinta en la ficha del centro.
  const [cadenceChoice, setCadenceChoice] = useState<string>(NO_CADENCE);
  const [customCadence, setCustomCadence] = useState("");
  const [price, setPrice] = useState<number | "">("");
  // Quién paga habitualmente aquí: sólo **precarga** la pregunta de la visita.
  const [defaultPayer, setDefaultPayer] = useState<string>(ASK_PAYER);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [useCustomPaymentMethod, setUseCustomPaymentMethod] = useState(false);
  const [billingNotes, setBillingNotes] = useState("");
  const [materialNotes, setMaterialNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Veces que ha ido: sólo lectura. Se cuenta sobre la caché de visitas que ya
  // usa el resto de la app (Hoy, Agenda, Finanzas) en vez de lanzar una
  // consulta propia: así no hay un segundo origen del dato que se quede
  // desfasado al registrar una visita, porque `invalidate()` ya la refresca.
  const { data: visits = [], isLoading: visitsLoading, isError: visitsError } = useVisits();
  const visitCount = useMemo(() => countCompletedVisits(visits, id), [visits, id]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data, error } = await supabase.from("centers").select("*").eq("id", id!).maybeSingle();
      if (error) { toast.error(error.message); setLoading(false); return; }
      if (!data) { toast.error("Centro no encontrado"); navigate("/pacientes"); return; }
      setName(data.name ?? "");
      setType(data.type ?? "Residencia");
      setContactPerson(data.contact_person ?? "");
      setContactPhone(data.contact_phone ?? "");
      setEmail((data as any).email ?? "");
      setUsualSchedule(data.usual_schedule ?? "");
      const loadedCadence = normalizeFrequencyWeeks(data.visit_frequency_weeks);
      if (loadedCadence === null) {
        setCadenceChoice(NO_CADENCE);
        setCustomCadence("");
      } else if ((VISIT_FREQUENCY_PRESETS as readonly number[]).includes(loadedCadence)) {
        setCadenceChoice(String(loadedCadence));
        setCustomCadence("");
      } else {
        setCadenceChoice(CUSTOM_CADENCE);
        setCustomCadence(String(loadedCadence));
      }
      setPrice(data.default_price_per_patient ?? "");
      setDefaultPayer(normalizeIncomeType(data.default_income_type) ?? ASK_PAYER);
      const loadedPaymentMethod = (data as any).payment_method ?? "";
      setPaymentMethod(loadedPaymentMethod);
      setUseCustomPaymentMethod(loadedPaymentMethod !== "" && !(PAYMENT_METHODS as readonly string[]).includes(loadedPaymentMethod));
      setBillingNotes((data as any).billing_notes ?? "");
      setMaterialNotes((data as any).material_notes ?? "");
      setNotes(data.notes ?? "");
      setIsActive(data.is_active ?? true);
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  // `null` = sin cadencia fija (domicilios, centros gestionados por terceros).
  const cadenceWeeks =
    cadenceChoice === NO_CADENCE
      ? null
      : normalizeFrequencyWeeks(cadenceChoice === CUSTOM_CADENCE ? customCadence : cadenceChoice);
  const cadenceInvalid = cadenceChoice === CUSTOM_CADENCE && cadenceWeeks === null;
  // El campo empieza vacío: no se marca en rojo hasta que hay algo escrito
  // (al guardar sin rellenarlo salta el aviso emergente).
  const cadenceError = cadenceInvalid && customCadence.trim() !== "";

  const defaultPayerType = normalizeIncomeType(defaultPayer);
  const payerHint = defaultPayerType
    ? `${INCOME_TYPE_HINT[defaultPayerType]}. Vendrá marcado, y podrás cambiarlo en cada visita.`
    : "La app preguntará quién paga cada vez que registres una visita aquí.";

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Falta el nombre del centro");
    if (cadenceInvalid) {
      return toast.error(`Indica cada cuántas semanas visitas el centro (${MIN_FREQUENCY_WEEKS}–${MAX_FREQUENCY_WEEKS})`);
    }
    setBusy(true);
    // Dirección, ciudad, código postal y la nota antigua de frecuencia ya no se
    // piden aquí (David sólo quiere lo imprescindible), así que **no van en el
    // payload**: lo que ya hubiera guardado se queda como está en la base.
    const payload: any = {
      name: name.trim(),
      type,
      contact_person: contactPerson || null,
      contact_phone: contactPhone || null,
      email: email || null,
      usual_schedule: usualSchedule.trim() || null,
      visit_frequency_weeks: cadenceWeeks,
      default_price_per_patient: price === "" ? null : price,
      default_income_type: normalizeIncomeType(defaultPayer),
      payment_method: paymentMethod || null,
      billing_notes: billingNotes || null,
      material_notes: materialNotes || null,
      notes: notes || null,
      is_active: isActive,
    };
    const { error } = isEdit
      ? await supabase.from("centers").update(payload).eq("id", id!)
      : await supabase.from("centers").insert({ ...payload, user_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Centro actualizado correctamente" : "Centro creado");
    invalidate();
    navigate("/pacientes");
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm("¿Eliminar este centro?")) return;
    setBusy(true);
    const { error } = await supabase.from("centers").delete().eq("id", id!);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Centro eliminado");
    invalidate();
    navigate("/pacientes");
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild>
          <Link to="/pacientes">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Volver a pacientes y centros</span>
          </Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">{isEdit ? "Editar centro" : "Nuevo centro"}</h1>
      </div>

      {/* Resumen: los cinco datos que David consulta y cambia de verdad. */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resumen</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre de la residencia</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="organization"
              placeholder="Ej.: Residencia Los Olivos"
            />
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium leading-none">Veces que he ido</p>
              {/* `role="status"` para que el lector de pantalla anuncie la cifra
                  cuando termina de contar, en vez de leer un 0 provisional. */}
              <div role="status" className="flex items-baseline gap-2 rounded-md border bg-muted/40 px-3 py-2">
                {visitsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs text-muted-foreground">Contando visitas…</span>
                  </>
                ) : visitsError ? (
                  /* Sin datos, un 0 parecería un dato bueno. */
                  <span className="text-xs font-medium text-muted-foreground">
                    No se han podido contar las visitas. Vuelve a entrar más tarde.
                  </span>
                ) : (
                  <>
                    <span className="text-xl font-bold text-primary">{visitCount}</span>
                    <span className="text-xs text-muted-foreground">
                      visita{visitCount === 1 ? "" : "s"} ya hecha{visitCount === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Lo cuenta la app sola: no hay que apuntarlo.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="price">Precio por paciente (€)</Label>
            <Input
              id="price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : +e.target.value)}
              placeholder="Ej.: 18"
            />
          </div>

          {/* De aquí sale el valor precargado de «¿quién paga?» al registrar una
              visita en este centro. Nunca se aplica solo: es sólo el valor por
              defecto de una pregunta que se sigue viendo y se puede cambiar. */}
          <div className="space-y-1.5">
            <Label htmlFor="payer">Quién paga normalmente</Label>
            <Select value={defaultPayer} onValueChange={setDefaultPayer}>
              <SelectTrigger id="payer" aria-describedby="payer-help">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ASK_PAYER}>Preguntar en cada visita</SelectItem>
                {INCOME_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {INCOME_TYPE_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="payer-help" className="text-xs text-muted-foreground">
              {payerHint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sch">Hora a la que quieren que empiece</Label>
            <Input
              id="sch"
              value={usualSchedule}
              onChange={(e) => setUsualSchedule(e.target.value)}
              aria-describedby="sch-help"
              placeholder="Ej.: 9:00"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {COMMON_START_TIMES.map((time) => {
                const selected = usualSchedule.trim() === time;
                return (
                  <Button
                    key={time}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    className="h-9 px-3 text-xs"
                    onClick={() => setUsualSchedule(selected ? "" : time)}
                  >
                    {time}
                  </Button>
                );
              })}
            </div>
            <p id="sch-help" className="text-xs text-muted-foreground">
              Toca una hora o escribe la que sea. Aparece en la ficha del centro.
            </p>
          </div>

          {/* Cadencia numérica: de aquí sale el aviso de «toca llamar». */}
          <div className="space-y-1.5">
            <Label htmlFor="cadence">Cada cuánto voy</Label>
            <Select
              value={cadenceChoice}
              onValueChange={(v) => {
                setCadenceChoice(v);
                if (v !== CUSTOM_CADENCE) setCustomCadence("");
              }}
            >
              <SelectTrigger id="cadence" aria-describedby="cadence-help">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CADENCE}>Sin cadencia fija</SelectItem>
                {VISIT_FREQUENCY_PRESETS.map((weeks) => (
                  <SelectItem key={weeks} value={String(weeks)}>
                    {frequencyLabel(weeks)}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_CADENCE}>Personalizado…</SelectItem>
              </SelectContent>
            </Select>

            {cadenceChoice === CUSTOM_CADENCE && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="cadence-weeks" className="text-xs font-normal text-muted-foreground">
                  Número de semanas
                </Label>
                <Input
                  id="cadence-weeks"
                  type="number"
                  inputMode="numeric"
                  min={MIN_FREQUENCY_WEEKS}
                  max={MAX_FREQUENCY_WEEKS}
                  step={1}
                  value={customCadence}
                  onChange={(e) => setCustomCadence(e.target.value)}
                  aria-invalid={cadenceError || undefined}
                  aria-describedby={cadenceError ? "cadence-error" : "cadence-help"}
                  placeholder="Ej.: 5"
                />
                {cadenceError && (
                  <p id="cadence-error" role="alert" className="text-xs font-medium text-destructive">
                    Escribe un número entero de semanas, entre {MIN_FREQUENCY_WEEKS} y {MAX_FREQUENCY_WEEKS}.
                  </p>
                )}
              </div>
            )}

            <p id="cadence-help" className="text-xs text-muted-foreground">
              {cadenceWeeks === null
                ? "Déjalo así si no lo visitas con una periodicidad fija (domicilios, centros que avisan ellos…)."
                : `Son ${weeksText(cadenceWeeks)}. Aparecerá un aviso para llamar hasta ${leadDaysFor(cadenceWeeks)} días antes de que toque la siguiente visita.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Resto de datos: se rellenan una vez y casi no se tocan. */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Otros datos</h2>

          <div className="space-y-1.5">
            <Label htmlFor="type">Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact">Contacto</Label>
              <Input id="contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} autoComplete="tel" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm">Forma de cobro</Label>
            <Select
              value={useCustomPaymentMethod ? "Otro" : paymentMethod}
              onValueChange={(v) => {
                setUseCustomPaymentMethod(v === "Otro");
                setPaymentMethod(v === "Otro" ? "" : v);
              }}
            >
              <SelectTrigger id="pm"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {useCustomPaymentMethod && (
            <div className="space-y-1.5">
              <Label htmlFor="pm-custom">Especifica la forma de cobro</Label>
              <Input id="pm-custom" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Ej.: Cheque, PayPal…" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="bn">Notas de facturación</Label>
            <Textarea id="bn" rows={2} value={billingNotes} onChange={(e) => setBillingNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn">Notas de material</Label>
            <Textarea id="mn" rows={2} value={materialNotes} onChange={(e) => setMaterialNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas generales</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="active">Activo</Label>
              <p id="active-help" className="text-xs text-muted-foreground">
                Si lo desactivas, no aparecerá en listas activas.
              </p>
            </div>
            <Switch id="active" aria-describedby="active-help" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isEdit ? "Guardar cambios" : "Guardar centro"}
      </Button>
      {isEdit && (
        <Button variant="destructive" className="w-full" onClick={handleDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" /> Eliminar centro
        </Button>
      )}
    </div>
  );
}
