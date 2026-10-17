const vscode = require('vscode');

const NOME_TEMA = 'gelido-w Zero Absoluto';

let item;
let timer;

function termometroAtivo() {
  const modo = vscode.workspace.getConfiguration('gelidoW').get('termometro', 'auto');
  if (modo === 'on') return true;
  if (modo === 'off') return false;
  return vscode.workspace.getConfiguration('workbench').get('colorTheme') === NOME_TEMA;
}

function contarDiagnosticos() {
  let erros = 0;
  let avisos = 0;
  for (const [, diagnosticos] of vscode.languages.getDiagnostics()) {
    for (const d of diagnosticos) {
      if (d.severity === vscode.DiagnosticSeverity.Error) erros++;
      else if (d.severity === vscode.DiagnosticSeverity.Warning) avisos++;
    }
  }
  return { erros, avisos };
}

function estadoPorTemperatura(temp) {
  if (temp <= -30) return { icone: '❄️', nome: 'Zero Absoluto' };
  if (temp <= -10) return { icone: '🧊', nome: 'Congelado' };
  if (temp <= 10) return { icone: '💧', nome: 'Gelo fino' };
  if (temp <= 25) return { icone: '💦', nome: 'Derretendo' };
  return { icone: '🔥', nome: 'Degelo crítico' };
}

function atualizar() {
  if (!termometroAtivo()) {
    item.hide();
    return;
  }

  const { erros, avisos } = contarDiagnosticos();
  const temp = Math.min(40, -40 + erros * 8 + avisos * 2);
  const estado = estadoPorTemperatura(temp);

  item.text = `${estado.icone} ${temp}°C`;
  item.tooltip = new vscode.MarkdownString(
    `**${estado.nome}**\n\nErros: ${erros}  \nAvisos: ${avisos}`
  );
  item.backgroundColor =
    temp > 25 ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
  item.show();
}

function agendar() {
  clearTimeout(timer);
  timer = setTimeout(atualizar, 250);
}

function activate(context) {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = 'gelido-w: temperatura';
  item.command = 'workbench.actions.view.problems';

  context.subscriptions.push(
    item,
    vscode.languages.onDidChangeDiagnostics(agendar),
    vscode.workspace.onDidChangeConfiguration((ev) => {
      if (ev.affectsConfiguration('gelidoW') || ev.affectsConfiguration('workbench.colorTheme')) {
        agendar();
      }
    }),
    { dispose: () => clearTimeout(timer) }
  );

  atualizar();
}

function deactivate() {}

module.exports = { activate, deactivate };