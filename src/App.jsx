import { useMemo, useState } from "react";
import "./App.css";

const initialData = {
  principal: "100000",
  rate: "1",
  months: "120",
};

function parseNumber(value) {
  const normalized = String(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function calculateSac(principal, monthlyRate, months) {
  const rows = [];
  const fixedAmortization = principal / months;
  let openingBalance = principal;

  for (let installment = 1; installment <= months; installment += 1) {
    const interest = openingBalance * monthlyRate;
    const amortization =
      installment === months ? openingBalance : fixedAmortization;
    const payment = amortization + interest;
    const closingBalance = Math.max(0, openingBalance - amortization);

    rows.push({
      installment,
      openingBalance,
      interest,
      amortization,
      payment,
      closingBalance,
    });

    openingBalance = closingBalance;
  }

  return rows;
}

function calculatePrice(principal, monthlyRate, months) {
  const rows = [];
  const fixedPayment =
    monthlyRate === 0
      ? principal / months
      : (principal * (monthlyRate * (1 + monthlyRate) ** months)) /
        ((1 + monthlyRate) ** months - 1);
  let openingBalance = principal;

  for (let installment = 1; installment <= months; installment += 1) {
    const interest = openingBalance * monthlyRate;
    const amortization =
      installment === months
        ? openingBalance
        : Math.min(openingBalance, fixedPayment - interest);
    const payment =
      installment === months ? amortization + interest : fixedPayment;
    const closingBalance = Math.max(0, openingBalance - amortization);

    rows.push({
      installment,
      openingBalance,
      interest,
      amortization,
      payment,
      closingBalance,
    });

    openingBalance = closingBalance;
  }

  return rows;
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className={`summary-card ${accent ? `summary-card--${accent}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const [form, setForm] = useState(initialData);
  const [system, setSystem] = useState("SAC");

  const principal = parseNumber(form.principal);
  const monthlyRate = parseNumber(form.rate) / 100;
  const months = Math.floor(parseNumber(form.months));

  const schedule = useMemo(() => {
    if (principal <= 0 || months <= 0 || monthlyRate < 0) return [];

    return system === "SAC"
      ? calculateSac(principal, monthlyRate, months)
      : calculatePrice(principal, monthlyRate, months);
  }, [principal, monthlyRate, months, system]);

  const totals = useMemo(
    () => ({
      totalPaid: schedule.reduce((sum, row) => sum + row.payment, 0),
      totalInterest: schedule.reduce((sum, row) => sum + row.interest, 0),
      firstPayment: schedule[0]?.payment || 0,
      lastPayment: schedule.at(-1)?.payment || 0,
    }),
    [schedule],
  );

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function clearForm() {
    setForm({ principal: "", rate: "", months: "" });
  }

  const invalidForm = principal <= 0 || months <= 0 || monthlyRate < 0;

  return (
    <main className="app-shell">
      <section className="calculator-card">
        <header className="page-header">
          <div>
            <p className="eyebrow">ESTUDO DE FINANCIAMENTO</p>
            <h1>Tabela SAC e Price - By Daniel lira</h1>
            <p className="subtitle">
              Compare a evolução das parcelas, juros e amortização do seu
              financiamento.
            </p>
          </div>
          <div className="header-mark" aria-hidden="true">
            ∑
          </div>
        </header>

        <section className="form-panel">
          <div className="field-group">
            <label htmlFor="principal">Valor financiado</label>
            <div className="input-with-prefix">
              <span>R$</span>
              <input
                id="principal"
                name="principal"
                type="number"
                min="0"
                step="0.01"
                value={form.principal}
                onChange={updateField}
                placeholder="100000"
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="rate">Taxa de juros mensal</label>
            <div className="input-with-suffix">
              <input
                id="rate"
                name="rate"
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={updateField}
                placeholder="1"
              />
              <span>% a.m.</span>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="months">Prazo</label>
            <div className="input-with-suffix">
              <input
                id="months"
                name="months"
                type="number"
                min="1"
                step="1"
                value={form.months}
                onChange={updateField}
                placeholder="120"
              />
              <span>meses</span>
            </div>
          </div>

          <button className="clear-button" type="button" onClick={clearForm}>
            Limpar
          </button>
        </section>

        <section className="system-tabs" aria-label="Sistema de amortização">
          {["SAC", "PRICE"].map((option) => (
            <button
              key={option}
              type="button"
              className={system === option ? "tab-button active" : "tab-button"}
              onClick={() => setSystem(option)}
            >
              {option === "SAC"
                ? "SAC — Amortização constante"
                : "Price — Parcela constante"}
            </button>
          ))}
        </section>

        {invalidForm ? (
          <div className="empty-state">
            Informe um valor financiado, uma taxa igual ou maior que zero e um
            prazo válido para gerar a tabela.
          </div>
        ) : (
          <>
            <section className="summary-grid">
              <SummaryCard
                label="Primeira parcela"
                value={formatCurrency(totals.firstPayment)}
                accent="primary"
              />
              <SummaryCard
                label="Última parcela"
                value={formatCurrency(totals.lastPayment)}
              />
              <SummaryCard
                label="Total de juros"
                value={formatCurrency(totals.totalInterest)}
              />
              <SummaryCard
                label="Total pago"
                value={formatCurrency(totals.totalPaid)}
                accent="dark"
              />
            </section>

            <section className="table-section">
              <div className="table-heading">
                <div>
                  <h2>Amortização {system}</h2>
                  <p>
                    {months} parcelas calculadas com taxa de{" "}
                    {formatNumber(parseNumber(form.rate))}% ao mês.
                  </p>
                </div>
                <span className="badge">
                  {system === "SAC"
                    ? "Amortização constante"
                    : "Parcela constante"}
                </span>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Parcela</th>
                      <th>Saldo inicial</th>
                      <th>Juros</th>
                      <th>Amortização</th>
                      <th>Prestação</th>
                      <th>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row) => (
                      <tr key={row.installment}>
                        <td className="installment-number">
                          {row.installment}
                        </td>
                        <td>{formatCurrency(row.openingBalance)}</td>
                        <td>{formatCurrency(row.interest)}</td>
                        <td>{formatCurrency(row.amortization)}</td>
                        <td className="payment-value">
                          {formatCurrency(row.payment)}
                        </td>
                        <td>{formatCurrency(row.closingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <footer className="page-footer">
          <span>Valores aproximados para estudo pessoal.</span>
          <span>Taxa informada como percentual mensal.</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
