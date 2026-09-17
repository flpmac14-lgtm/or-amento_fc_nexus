"""Busca de dados de CNPJ (razão social/nome fantasia + endereço) pra
pré-preencher a "Identificação do cliente" — pedido explícito do usuário:
primeira etapa de automação (hoje tudo isso é digitado à mão numa
planilha Excel); uma etapa futura vai trocar a origem desses campos por
uma extração automática do desenho, mas o CNPJ já automatiza nome/endereço
agora.

Fonte: BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj}) — gratuita,
sem necessidade de chave/cadastro, dados oficiais da Receita Federal.
"""

from __future__ import annotations

import re

import httpx

_BRASIL_API_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"


class CnpjInvalido(Exception):
    pass


class CnpjNaoEncontrado(Exception):
    pass


def _formatar_endereco(dados: dict) -> str:
    partes_logradouro = [dados.get("logradouro") or "", dados.get("numero") or ""]
    linha1 = " ".join(p for p in partes_logradouro if p).strip()
    if dados.get("complemento"):
        linha1 = f"{linha1} - {dados['complemento']}" if linha1 else dados["complemento"]

    municipio = dados.get("municipio") or ""
    uf = dados.get("uf") or ""
    cidade_uf = f"{municipio}/{uf}" if municipio and uf else (municipio or uf)

    partes = [p for p in [linha1, dados.get("bairro"), cidade_uf] if p]
    endereco = ", ".join(partes)
    if dados.get("cep"):
        endereco = f"{endereco} - CEP {dados['cep']}" if endereco else f"CEP {dados['cep']}"
    return endereco


def buscar_cnpj(cnpj: str) -> dict:
    """Devolve {"cnpj", "nome", "endereco"} — `nome` prioriza a razão
    social (nome_fantasia como complemento entre parênteses quando
    diferente); levanta CnpjInvalido (formato) ou CnpjNaoEncontrado
    (Receita Federal não tem esse CNPJ)."""
    digitos = re.sub(r"\D", "", cnpj or "")
    if len(digitos) != 14:
        raise CnpjInvalido(f"CNPJ deve ter 14 dígitos (recebido: {len(digitos)}).")

    try:
        resposta = httpx.get(_BRASIL_API_URL.format(cnpj=digitos), timeout=10)
    except httpx.HTTPError as e:
        raise CnpjNaoEncontrado(f"Falha ao consultar o CNPJ: {e}") from e

    if resposta.status_code == 404:
        raise CnpjNaoEncontrado(f"CNPJ {digitos} não encontrado na Receita Federal.")
    resposta.raise_for_status()

    dados = resposta.json()
    razao_social = (dados.get("razao_social") or "").strip()
    nome_fantasia = (dados.get("nome_fantasia") or "").strip()
    if nome_fantasia and nome_fantasia != razao_social:
        nome = f"{razao_social} ({nome_fantasia})" if razao_social else nome_fantasia
    else:
        nome = razao_social or nome_fantasia

    return {
        "cnpj": digitos,
        "nome": nome,
        "endereco": _formatar_endereco(dados),
    }
