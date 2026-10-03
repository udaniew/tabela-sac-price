import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import './App.css';

const initialForm = {
  principal: '100000',
  rate: '1',
  months: '120',
};

const MAX_MONTHS = 600;

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  // aceita formato pt-BR (1.234,56) e ponto decimal (1234.56)
  const normalized = raw
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

// Arredonda um valor em reais para centavos inteiros (metade-para-cima), com
// guarda relativa que corrige o erro de representacao binaria (ex.: 1.005 -> 1.01).
function toCents(value) {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 100;
  const guard = Math.abs(scaled) * Number.EPSILON * 4;
  return Math.round(scaled + (scaled < 0 ? -guard : guard));
}

function fromCents(cents) {
  return Math.round(cents) / 100;
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function numberFormat(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

// Tabela SAC — amortizacao constante.
// Amortizacao = PV / n ; Juros = i * saldoDevedorAnterior ; Parcela = Amortizacao + Juros.
// Todo o bookkeeping e feito em centavos inteiros, entao o saldo nunca deriva.
function calculateSac(principal, rate, months) {
  const totalCents = toCents(principal);
  const constantAmortization = Math.round(totalCents / months);
  const rows = [];
  let balance = totalCents;

  for (let index = 1; index <= months && balance > 0; index += 1) {
    const isLast = index === months;
    const opening = balance;
    const interest = toCents((opening / 100) * rate);
    // nunca amortizar mais do que o saldo devedor; a ultima parcela zera o saldo
    const amortization = isLast ? opening : Math.min(opening, constantAmortization);
    const payment = interest + amortization;
    balance = Math.max(0, opening - amortization);

    rows.push({
      installment: index,
      openingBalance: fromCents(opening),
      interest: fromCents(interest),
      amortization: fromCents(amortization),
      payment: fromCents(payment),
      closingBalance: fromCents(balance),
    });
  }

  return rows;
}

// Tabela Price — parcela constante.
// PMT = PV * i * (1+i)^n / ((1+i)^n - 1) ; Juros = i * saldoDevedorAnterior ; Amortizacao = PMT - Juros.
function calculatePrice(principal, rate, months) {
  const totalCents = toCents(principal);
  const factor = (1 + rate) ** months;
  const constantPayment = rate === 0
    ? Math.round(totalCents / months)
    : toCents(((totalCents / 100) * rate * factor) / (factor - 1));

  const rows = [];
  let balance = totalCents;

  for (let index = 1; index <= months && balance > 0; index += 1) {
    const isLast = index === months;
    const opening = balance;
    const interest = toCents((opening / 100) * rate);
    const amortization = isLast
      ? opening
      : Math.min(opening, constantPayment - interest);
    const payment = interest + amortization;
    balance = Math.max(0, opening - amortization);

    rows.push({
      installment: index,
      openingBalance: fromCents(opening),
      interest: fromCents(interest),
      amortization: fromCents(amortization),
      payment: fromCents(payment),
      closingBalance: fromCents(balance),
    });
  }

  return rows;
}

const scheduleRowShape = PropTypes.shape({
  installment: PropTypes.number.isRequired,
  openingBalance: PropTypes.number.isRequired,
  interest: PropTypes.number.isRequired,
  amortization: PropTypes.number.isRequired,
  payment: PropTypes.number.isRequired,
  closingBalance: PropTypes.number.isRequired,
});

function SummaryCard({ title, value, featured = false }) {
  return (
    <div className={featured ? 'summary-card featured' : 'summary-card'}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

SummaryCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  featured: PropTypes.bool,
};

function RowValues({ row }) {
  return (
    <>
      <td className="center">{row.installment}</td>
      <td>{currency(row.openingBalance)}</td>
      <td>{currency(row.interest)}</td>
      <td>{currency(row.amortization)}</td>
      <td className="strong-value">{currency(row.payment)}</td>
      <td>{currency(row.closingBalance)}</td>
    </>
  );
}

RowValues.propTypes = {
  row: scheduleRowShape.isRequired,
};

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [system, setSystem] = useState('SAC');

  const principal = toNumber(form.principal);
  const rate = toNumber(form.rate) / 100;
  const requestedMonths = Math.floor(toNumber(form.months));
  const months = Math.min(MAX_MONTHS, requestedMonths);
  const monthsCapped = requestedMonths > MAX_MONTHS;

  const schedule = useMemo(() => {
    if (principal <= 0 || months <= 0 || rate < 0) return [];
    return system === 'SAC'
      ? calculateSac(principal, rate, months)
      : calculatePrice(principal, rate, months);
  }, [principal, rate, months, system]);

  const totals = useMemo(() => {
    let totalPaid = 0;
    let totalInterest = 0;
    let totalAmortized = 0;

    schedule.forEach((row) => {
      totalPaid += row.payment;
      totalInterest += row.interest;
      totalAmortized += row.amortization;
    });

    const firstRow = schedule.length > 0 ? schedule[0] : null;
    const lastRow = schedule.length > 0 ? schedule[schedule.length - 1] : null;

    return {
      firstPayment: firstRow ? firstRow.payment : 0,
      lastPayment: lastRow ? lastRow.payment : 0,
      totalPaid: toCents(totalPaid) / 100,
      totalInterest: toCents(totalInterest) / 100,
      totalAmortized: toCents(totalAmortized) / 100,
    };
  }, [schedule]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function clearForm() {
    setForm({ principal: '', rate: '', months: '' });
  }

  const invalidInputs = principal <= 0 || months <= 0 || rate < 0;
  // Em combinacoes extremas (taxa muito alta para o prazo) a amortizacao cai
  // abaixo de 1 centavo e a tabela nao existe. Nesses casos avisamos o usuario.
  const unamortizable = schedule.some((row) => row.amortization <= 0);
  const invalid = invalidInputs || schedule.length === 0 || unamortizable;

  return (
    <main className="app-shell">
      <section className="calculator">
        <header className="header">
          <div>
            <p className="eyebrow">ESTUDO DE FINANCIAMENTO</p>
            <h1>Tabela SAC e Price</h1>
            <p className="subtitle">Compare parcelas, juros e amortização do seu financiamento.</p>
          </div>
          <div className="logo-mark">∑</div>
        </header>

        <section className="form-area">
          <div className="field">
            <label htmlFor="principal">Valor financiado</label>
            <div className="input-box">
              <span>R$</span>
              <input id="principal" name="principal" type="number" min="0" step="0.01" value={form.principal} onChange={handleChange} placeholder="100000" inputMode="decimal" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="rate">Taxa mensal</label>
            <div className="input-box">
              <input id="rate" name="rate" type="number" min="0" step="0.01" value={form.rate} onChange={handleChange} placeholder="1" inputMode="decimal" />
              <span>% a.m.</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="months">Prazo</label>
            <div className="input-box">
              <input id="months" name="months" type="number" min="1" step="1" value={form.months} onChange={handleChange} placeholder="120" inputMode="numeric" />
              <span>meses</span>
            </div>
          </div>

          <button className="clear-button" type="button" onClick={clearForm}>Limpar</button>
        </section>

        <nav className="tabs" aria-label="Sistema de amortização">
          <button type="button" className={system === 'SAC' ? 'tab active' : 'tab'} onClick={() => setSystem('SAC')}>SAC — amortização constante</button>
          <button type="button" className={system === 'PRICE' ? 'tab active' : 'tab'} onClick={() => setSystem('PRICE')}>Price — parcela constante</button>
        </nav>

        {invalid ? (
          <div className="message">
            {unamortizable
              ? 'Essa combinação de taxa e prazo não é viável: a amortização mensal fica abaixo de um centavo. Reduza a taxa ou o prazo.'
              : 'Informe um valor, uma taxa válida e um prazo maior que zero para gerar a tabela.'}
          </div>
        ) : (
          <>
            <section className="summary">
              <SummaryCard title="Primeira parcela" value={currency(totals.firstPayment)} featured />
              <SummaryCard title="Última parcela" value={currency(totals.lastPayment)} />
              <SummaryCard title="Total de juros" value={currency(totals.totalInterest)} />
              <SummaryCard title="Total pago" value={currency(totals.totalPaid)} featured />
              <SummaryCard title="Total amortizado" value={currency(totals.totalAmortized)} />
            </section>

            <section className="table-area">
              <div className="table-header">
                <div>
                  <h2>Amortização {system}</h2>
                  <p>{schedule.length} parcelas com taxa de {numberFormat(toNumber(form.rate))}% ao mês.</p>
                </div>
                {monthsCapped && (
                  <div className="message">Prazo limitado a {MAX_MONTHS} meses para manter a tabela navegável.</div>
                )}
                <span className="badge">{system === 'SAC' ? 'Amortização constante' : 'Parcela constante'}</span>
              </div>

              <p className="scroll-hint" aria-hidden="true">
                Deslize a tabela para o lado para ver todas as colunas.
              </p>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="center">Parcela</th>
                      <th>Saldo inicial</th>
                      <th>Juros</th>
                      <th>Amortização</th>
                      <th>Prestação</th>
                      <th>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row) => (
                      <tr key={row.installment}><RowValues row={row} /></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <footer className="footer">
          <span>Valores aproximados para estudo pessoal.</span>
          <span>Taxa informada como percentual mensal.</span>
          <span className="credits">by Daniel lira</span>
        </footer>
      </section>
    </main>
  );
}
