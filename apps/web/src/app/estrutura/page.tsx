"use client";

// Estrutura do sistema — pedido do usuário (28/10/2026): o diagrama de como os
// dados entram no FC Nexus (o mesmo da apresentação), no topo do menu lateral,
// pra baixar em PDF quando quiser. Folha A4 deitada, sempre em fundo branco.
// "Baixar PDF" abre a impressão do navegador (Salvar como PDF).

// Desenho estático (SVG escrito à mão, sem dados do banco).
const DIAGRAMA = "<svg viewBox=\"0 0 1160 640\" role=\"img\" aria-label=\"As planilhas do J:, o ERP Sectra e as pastas de PDF são lidos por um PC da empresa a cada 15 minutos, que grava no banco na nuvem; o site e o motor de cálculo usam esse banco, e cada perfil acessa o site pelo navegador ou celular.\">\n        <defs>\n          <marker id=\"p\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\">\n            <path d=\"M0,0 L10,5 L0,10 z\" class=\"ponta\" />\n          </marker>\n          <marker id=\"pm\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\">\n            <path d=\"M0,0 L10,5 L0,10 z\" class=\"ponta-marca\" />\n          </marker>\n        </defs>\n        <rect x=\"575\" y=\"38\" width=\"320\" height=\"590\" rx=\"14\" class=\"faixa\" />\n        <text x=\"20\" y=\"26\" class=\"col\">NA EMPRESA</text>\n        <text x=\"300\" y=\"26\" class=\"col\">PC DA EMPRESA</text>\n        <text x=\"591\" y=\"26\" class=\"col\">NA NUVEM</text>\n        <text x=\"935\" y=\"26\" class=\"col\">QUEM USA</text>\n        <rect x=\"20\" y=\"50\" width=\"230\" height=\"200\" rx=\"10\" class=\"caixa\" />\n        <text x=\"36\" y=\"76\" class=\"tit\">Planilhas no J:</text>\n        <text x=\"36\" y=\"100\" class=\"txt\">Controle de obras / Follow up</text>\n        <text x=\"36\" y=\"120\" class=\"txt\">Material de compra (MACLM)</text>\n        <text x=\"36\" y=\"140\" class=\"txt\">Croqui de corte</text>\n        <text x=\"36\" y=\"160\" class=\"txt\">Data book</text>\n        <text x=\"36\" y=\"180\" class=\"txt\">Recebimento e estoque</text>\n        <text x=\"36\" y=\"200\" class=\"txt\">Fornecedores</text>\n        <text x=\"36\" y=\"228\" class=\"mudo\">o pessoal continua usando o Excel</text>\n\n        <rect x=\"20\" y=\"272\" width=\"230\" height=\"92\" rx=\"10\" class=\"caixa\" />\n        <text x=\"36\" y=\"298\" class=\"tit\">ERP Sectra</text>\n        <text x=\"36\" y=\"320\" class=\"txt\">pedidos, compras, notas,</text>\n        <text x=\"36\" y=\"338\" class=\"txt\">a pagar e a receber</text>\n        <text x=\"36\" y=\"354\" class=\"mudo\">SQL Server · só consulta</text>\n\n        <rect x=\"20\" y=\"386\" width=\"230\" height=\"78\" rx=\"10\" class=\"caixa\" />\n        <text x=\"36\" y=\"412\" class=\"tit\">Pastas de PDFs</text>\n        <text x=\"36\" y=\"434\" class=\"txt\">programas de corte,</text>\n        <text x=\"36\" y=\"452\" class=\"txt\">certificados de matéria-prima</text>\n        <rect x=\"300\" y=\"150\" width=\"215\" height=\"210\" rx=\"10\" class=\"caixa-marca\" />\n        <text x=\"316\" y=\"178\" class=\"tit\">Sincronizadores</text>\n        <text x=\"316\" y=\"200\" class=\"txt\">rodam sozinhos no</text>\n        <text x=\"316\" y=\"218\" class=\"txt\">Agendador do Windows</text>\n        <text x=\"316\" y=\"246\" class=\"tit destaque\">a cada 15 min</text>\n        <text x=\"316\" y=\"270\" class=\"txt\">comparam com a última</text>\n        <text x=\"316\" y=\"288\" class=\"txt\">leitura e só mandam</text>\n        <text x=\"316\" y=\"306\" class=\"txt\">o que mudou</text>\n        <text x=\"316\" y=\"340\" class=\"mudo\">Python</text>\n\n        <rect x=\"300\" y=\"430\" width=\"215\" height=\"76\" rx=\"10\" class=\"caixa\" />\n        <text x=\"316\" y=\"456\" class=\"tit\">Backup no OneDrive</text>\n        <text x=\"316\" y=\"478\" class=\"txt\">todo dia às 12:20,</text>\n        <text x=\"316\" y=\"495\" class=\"txt\">guarda 30 dias</text>\n        <rect x=\"591\" y=\"56\" width=\"288\" height=\"196\" rx=\"10\" class=\"caixa\" />\n        <text x=\"607\" y=\"82\" class=\"tit\">Site fcnexus.app.br</text>\n        <text x=\"607\" y=\"106\" class=\"txt\">Follow up / Produção</text>\n        <text x=\"607\" y=\"124\" class=\"txt\">Visão Geral</text>\n        <text x=\"607\" y=\"142\" class=\"txt\">Financeiro</text>\n        <text x=\"607\" y=\"160\" class=\"txt\">Almoxarifado e Fornecedores</text>\n        <text x=\"607\" y=\"178\" class=\"txt\">Orçamentos</text>\n        <text x=\"607\" y=\"196\" class=\"txt\">Canal de Escuta</text>\n        <text x=\"607\" y=\"236\" class=\"mudo\">Vercel · confere quem é cada um</text>\n\n        <rect x=\"591\" y=\"300\" width=\"288\" height=\"118\" rx=\"10\" class=\"caixa-marca\" />\n        <text x=\"607\" y=\"328\" class=\"tit\">Banco de dados</text>\n        <text x=\"607\" y=\"352\" class=\"txt\">tudo o que veio das planilhas e do ERP,</text>\n        <text x=\"607\" y=\"370\" class=\"txt\">apontamentos, fotos e conferências,</text>\n        <text x=\"607\" y=\"388\" class=\"txt\">contas e permissões</text>\n        <text x=\"607\" y=\"408\" class=\"mudo\">Supabase</text>\n\n        <rect x=\"591\" y=\"466\" width=\"288\" height=\"82\" rx=\"10\" class=\"caixa\" />\n        <text x=\"607\" y=\"492\" class=\"tit\">Motor de cálculo</text>\n        <text x=\"607\" y=\"514\" class=\"txt\">orçamentos, leitura de desenhos,</text>\n        <text x=\"607\" y=\"532\" class=\"txt\">telas do Follow up e apontamentos</text>\n\n        <rect x=\"591\" y=\"574\" width=\"288\" height=\"44\" rx=\"10\" class=\"caixa tracejada\" />\n        <text x=\"607\" y=\"601\" class=\"txt\">IA (Gemini): só quando o desenho não é lido</text>\n        <rect x=\"935\" y=\"56\" width=\"205\" height=\"58\" rx=\"10\" class=\"caixa\" />\n        <text x=\"951\" y=\"80\" class=\"tit\">Colaboradores</text>\n        <text x=\"951\" y=\"100\" class=\"mudo\">Canal de Escuta pelo QR code</text>\n\n        <rect x=\"935\" y=\"140\" width=\"205\" height=\"478\" rx=\"10\" class=\"caixa\" />\n        <text x=\"951\" y=\"166\" class=\"tit\">Cada perfil vê só o seu</text>\n        <text x=\"951\" y=\"194\" class=\"txt\">Gerência: tudo</text>\n        <text x=\"951\" y=\"220\" class=\"txt\">PCP: Follow up, Visão Geral</text>\n        <text x=\"951\" y=\"246\" class=\"txt\">Projeto: material, croqui</text>\n        <text x=\"951\" y=\"272\" class=\"txt\">Corte: programas do laser</text>\n        <text x=\"951\" y=\"298\" class=\"txt\">Usinagem: apontamento</text>\n        <text x=\"951\" y=\"324\" class=\"txt\">Caldeiraria: apontamento</text>\n        <text x=\"951\" y=\"350\" class=\"txt\">Pintura: etapas e fotos</text>\n        <text x=\"951\" y=\"376\" class=\"txt\">Qualidade: certificados,</text>\n        <text x=\"951\" y=\"392\" class=\"txt\">data book</text>\n        <text x=\"951\" y=\"418\" class=\"txt\">Financeiro: painel</text>\n        <text x=\"951\" y=\"444\" class=\"txt\">Almoxarifado: conferência,</text>\n        <text x=\"951\" y=\"460\" class=\"txt\">fotos, fornecedores</text>\n        <line x1=\"951\" y1=\"486\" x2=\"1124\" y2=\"486\" class=\"divisor\" />\n        <text x=\"951\" y=\"510\" class=\"mudo\">pelo navegador do PC</text>\n        <text x=\"951\" y=\"528\" class=\"mudo\">ou pelo celular</text>\n        <path d=\"M250 150 C 275 150, 280 200, 298 205\" class=\"seta\" marker-end=\"url(#p)\" />\n        <text x=\"256\" y=\"138\" class=\"rot\">lê o arquivo</text>\n        <path d=\"M250 318 L 298 300\" class=\"seta\" marker-end=\"url(#p)\" />\n        <path d=\"M250 425 C 280 420, 285 360, 300 345\" class=\"seta\" marker-end=\"url(#p)\" />\n        <path d=\"M515 280 C 550 280, 560 340, 589 345\" class=\"seta-marca\" marker-end=\"url(#pm)\" />\n        <text x=\"522\" y=\"270\" class=\"rot\">grava</text>\n        <path d=\"M591 405 C 560 420, 545 460, 517 468\" class=\"seta tracejada\" marker-end=\"url(#p)\" />\n        <text x=\"528\" y=\"440\" class=\"rot\">cópia</text>\n        <line x1=\"735\" y1=\"254\" x2=\"735\" y2=\"298\" class=\"seta-marca\" marker-start=\"url(#pm)\" marker-end=\"url(#pm)\" />\n        <text x=\"745\" y=\"281\" class=\"rot\">lê e grava</text>\n        <line x1=\"735\" y1=\"420\" x2=\"735\" y2=\"464\" class=\"seta-marca\" marker-start=\"url(#pm)\" marker-end=\"url(#pm)\" />\n        <text x=\"745\" y=\"447\" class=\"rot\">lê e grava</text>\n        <path d=\"M879 210 L 902 210 L 902 505 L 881 505\" class=\"seta\" marker-end=\"url(#p)\" />\n        <text x=\"908\" y=\"360\" class=\"rot\" transform=\"rotate(90 908 360)\" text-anchor=\"middle\">pede cálculos</text>\n        <line x1=\"735\" y1=\"548\" x2=\"735\" y2=\"572\" class=\"seta tracejada\" marker-end=\"url(#p)\" />\n        <line x1=\"935\" y1=\"85\" x2=\"881\" y2=\"85\" class=\"seta\" marker-end=\"url(#p)\" />\n        <line x1=\"935\" y1=\"170\" x2=\"881\" y2=\"150\" class=\"seta\" marker-end=\"url(#p)\" />\n        <text x=\"938\" y=\"132\" class=\"rot\">login</text>\n      </svg>";

const REGRAS: [string, string][] = [
  ["Ninguém digita duas vezes", "O que é lançado nas planilhas do J: e no ERP aparece no sistema sozinho, em até 15 minutos."],
  ["O ERP nunca é alterado", "O FC Nexus só consulta o Sectra. Pedidos, notas e financeiro continuam sendo lançados lá."],
  ["Cada um vê o que precisa", "O login define as abas: o operador do laser vê o corte, a qualidade vê os certificados, o almoxarifado confere o que chegou."],
];

export default function PaginaEstrutura() {
  return (
    <div className="estrutura-fundo">
      <style>{`
        .estrutura-fundo { min-height: 100vh; background: #dfe4ea; padding: 24px 12px; color: #17243a; font-family: Arial, Helvetica, sans-serif; }
        .estrutura-barra { max-width: 297mm; margin: 0 auto 12px; display: flex; justify-content: flex-end; gap: 8px; }
        .estrutura-barra button, .estrutura-barra a { height: 40px; padding: 0 16px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; cursor: pointer; text-decoration: none; }
        .estrutura-pdf { background: #1e3a5f; color: #fff; border: 0; }
        .estrutura-voltar { background: #fff; color: #1e3a5f; border: 1px solid #9fb0c4; }
        .folha-estrutura { max-width: 297mm; margin: 0 auto; background: #fff; padding: 10mm 12mm; box-shadow: 0 6px 24px rgba(23, 36, 58, 0.18); display: flex; flex-direction: column; gap: 10px; }
        .folha-estrutura h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.01em; }
        .folha-estrutura h1 span { color: #1e3a5f; }
        .folha-estrutura .sub { margin: 2px 0 0; color: #5b6779; font-size: 13px; }
        .folha-estrutura .rolagem { overflow-x: auto; }
        .folha-estrutura svg { display: block; width: 100%; min-width: 760px; height: auto; color: #17243a; font-family: Arial, Helvetica, sans-serif; }
        .folha-estrutura .legenda { margin: 0; color: #5b6779; font-size: 12px; }
        .folha-estrutura .regras { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .folha-estrutura .regra { border-top: 3px solid #1e3a5f; padding-top: 6px; }
        .folha-estrutura .regra b { display: block; font-size: 14px; }
        .folha-estrutura .regra p { margin: 0; color: #5b6779; font-size: 12px; line-height: 1.4; }
        .folha-estrutura .caixa { fill: #fff; stroke: #c9d1dc; stroke-width: 1.5; }
        .folha-estrutura .caixa-marca { fill: #e4ecf6; stroke: #1e3a5f; stroke-width: 2; }
        .folha-estrutura .faixa { fill: #eef2f7; }
        .folha-estrutura .tit { font-weight: 700; font-size: 15px; fill: #17243a; }
        .folha-estrutura .destaque { fill: #1e3a5f; }
        .folha-estrutura .col { font-weight: 800; font-size: 12px; letter-spacing: 0.12em; fill: #1e3a5f; }
        .folha-estrutura .txt { font-size: 12.5px; fill: #17243a; }
        .folha-estrutura .mudo { font-size: 11.5px; fill: #5b6779; }
        .folha-estrutura .seta { stroke: #17243a; stroke-width: 1.6; fill: none; }
        .folha-estrutura .seta-marca { stroke: #1e3a5f; stroke-width: 2.2; fill: none; }
        .folha-estrutura .tracejada { stroke-dasharray: 5 4; }
        .folha-estrutura .rot { font-size: 11.5px; font-weight: 700; fill: #1e3a5f; }
        .folha-estrutura .ponta { fill: #17243a; }
        .folha-estrutura .ponta-marca { fill: #1e3a5f; }
        .folha-estrutura .divisor { stroke: #c9d1dc; stroke-width: 1; }
        @media (max-width: 700px) { .folha-estrutura .regras { grid-template-columns: 1fr; } }
        @page estrutura { size: A4 landscape; margin: 8mm; }
        @media print {
          .estrutura-fundo { background: #fff !important; padding: 0; min-height: 0; }
          .estrutura-barra { display: none; }
          .folha-estrutura { page: estrutura; box-shadow: none; max-width: none; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .folha-estrutura svg { min-width: 0; }
        }
      `}</style>
      <div className="estrutura-barra">
        <button type="button" className="estrutura-voltar" onClick={() => history.back()}>
          ← Voltar
        </button>
        <button type="button" className="estrutura-pdf" onClick={() => window.print()}>
          Baixar PDF
        </button>
      </div>
      <main className="folha-estrutura">
        <header>
          <h1>
            Estrutura do <span>FC Nexus</span>
          </h1>
          <p className="sub">Como os dados da Macfab entram no sistema e chegam a cada pessoa, no PC ou no celular.</p>
        </header>
        <div className="rolagem" dangerouslySetInnerHTML={{ __html: DIAGRAMA }} />
        <p className="legenda">
          As planilhas e o ERP continuam sendo a fonte. Um PC da empresa lê tudo a cada 15 minutos e grava no banco na nuvem. O site e o
          motor de cálculo trabalham sobre esse banco, e cada pessoa entra no site com o seu login.
        </p>
        <section className="regras">
          {REGRAS.map(([t, d]) => (
            <div key={t} className="regra">
              <b>{t}</b>
              <p>{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
