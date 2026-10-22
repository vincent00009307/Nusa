const BINANCE_BASE = "https://data-api.binance.vision";
const TWELVE_BASE = "https://api.twelvedata.com";
const ALLOWED_INTERVALS = new Set(["1min","5min","15min","30min","1h","2h","4h","8h","1day","1week"]);
const CRYPTO_PAIRS = {"BTC/USDT":"BTCUSDT","ETH/USDT":"ETHUSDT","SOL/USDT":"SOLUSDT"};
const CRYPTO_SYMBOLS = new Set(Object.keys(CRYPTO_PAIRS));
function json(res, status=200, response) { response.setHeader("content-type","application/json; charset=utf-8"); response.setHeader("cache-control","no-store"); return response.status(status).json(res); }
export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const symbol = (url.searchParams.get("symbol") || "BTC/USDT").toUpperCase();
  const interval = url.searchParams.get("interval") || "1h";
  if (!ALLOWED_INTERVALS.has(interval)) return json({error:"Interval tidak didukung."},400,res);
  try {
    if (CRYPTO_SYMBOLS.has(symbol)) {
      const pair = CRYPTO_PAIRS[symbol];
      const tf = interval === "1min" ? "1m" : interval === "5min" ? "5m" : interval === "15min" ? "15m" : interval === "30min" ? "30m" : interval === "1h" ? "1h" : interval === "2h" ? "2h" : interval === "4h" ? "4h" : interval === "8h" ? "8h" : interval === "1day" ? "1d" : "1w";
      const [tickerResponse, candleResponse] = await Promise.all([
        fetch(BINANCE_BASE+"/api/v3/ticker/24hr?symbol="+pair,{cache:"no-store"}),
        fetch(BINANCE_BASE+"/api/v3/klines?symbol="+pair+"&interval="+tf+"&limit=80",{cache:"no-store"})
      ]);
      if (!tickerResponse.ok || !candleResponse.ok) throw new Error("Binance public market API tidak dapat dijangkau untuk "+symbol+".");
      const ticker = await tickerResponse.json();
      const raw = await candleResponse.json();
      return json({
        symbol, exchange:"Binance Spot", provider:"Binance Public API", interval,
        price:Number(ticker.lastPrice), changePercent:Number(ticker.priceChangePercent),
        currency:"USDT", updatedAt:new Date().toISOString(),
        candles:raw.map(k=>({time:new Date(Number(k[0])).toISOString(),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}))
      },200,res);
    }
    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) {
      const yahooSymbols = {"EUR/USD":"EURUSD=X","XAU/USD":"XAUUSD=X","AAPL":"AAPL"};
      const yahooSymbol = yahooSymbols[symbol];
      if (!yahooSymbol) return json({error:"Instrumen tidak didukung: "+symbol},400,res);
      const yahooIntervals = {"1min":"1m","5min":"5m","15min":"15m","30min":"30m","1h":"60m","2h":"60m","4h":"60m","8h":"60m","1day":"1d","1week":"1wk"};
      const range = interval==="1week" ? "1y" : interval==="1day" ? "1mo" : "5d";
      const yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(yahooSymbol)+"?range="+range+"&interval="+yahooIntervals[interval]+"&includePrePost=false";
      const yahooResponse = await fetch(yahooUrl,{headers:{"accept":"application/json","user-agent":"Mozilla/5.0 TradingAgent/1.0"},cache:"no-store"});
      if (!yahooResponse.ok) throw new Error("Penyedia data publik tidak tersedia untuk "+symbol+" (HTTP "+yahooResponse.status+").");
      const yahooData = await yahooResponse.json();
      const result = yahooData.chart?.result?.[0];
      if (!result?.timestamp?.length) throw new Error("Penyedia data tidak mengembalikan candle untuk "+symbol+".");
      const q = result.indicators?.quote?.[0] || {};
      const candles = result.timestamp.map((ts,i)=>({time:new Date(ts*1000).toISOString(),open:Number(q.open?.[i]),high:Number(q.high?.[i]),low:Number(q.low?.[i]),close:Number(q.close?.[i]),volume:Number(q.volume?.[i]||0)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
      if (!candles.length) throw new Error("Data candle tidak valid untuk "+symbol+".");
      const meta = result.meta || {};
      const price = Number(meta.regularMarketPrice ?? candles[candles.length-1].close);
      const previous = Number(meta.chartPreviousClose ?? meta.previousClose ?? candles[candles.length-2]?.close ?? price);
      const changePercent = previous ? ((price-previous)/previous)*100 : 0;
      return json({symbol,exchange:meta.exchangeName||meta.fullExchangeName||"Yahoo Finance",provider:"Yahoo Finance public chart",interval,price,changePercent,currency:symbol==="AAPL"?"$":symbol==="EUR/USD"?"":"$",updatedAt:new Date().toISOString(),candles},200,res);
    }
    const tdSymbol = symbol === "AAPL" ? "AAPL" : symbol;
    const [quoteResponse, seriesResponse] = await Promise.all([
      fetch(TWELVE_BASE+"/quote?symbol="+encodeURIComponent(tdSymbol)+"&apikey="+encodeURIComponent(apiKey),{cache:"no-store"}),
      fetch(TWELVE_BASE+"/time_series?symbol="+encodeURIComponent(tdSymbol)+"&interval="+encodeURIComponent(interval)+"&outputsize=80&apikey="+encodeURIComponent(apiKey),{cache:"no-store"})
    ]);
    const quote = await quoteResponse.json(), series = await seriesResponse.json();
    if (!quoteResponse.ok || !seriesResponse.ok || quote.status==="error" || series.status==="error" || !series.values) {
      const msg=quote.message||series.message||quote.code||series.code||"Penyedia data menolak permintaan. Periksa cakupan instrumen dan limit API.";
      return json({error:"Twelve Data: "+msg},502,res);
    }
    const values=series.values.slice().reverse();
    const price=Number(quote.close||values[values.length-1]?.close);
    return json({
      symbol, exchange:series.meta?.exchange||quote.exchange||"Twelve Data", provider:"Twelve Data API", interval,
      price, changePercent:Number(quote.percent_change||0), currency:symbol==="AAPL"?"$":"", updatedAt:new Date().toISOString(),
      candles:values.map(v=>({time:new Date(v.datetime).toISOString(),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.volume||0)}))
    },200,res);
  } catch (error) {
    return json({error:error instanceof Error?error.message:"Kesalahan saat mengambil data market."},502,res);
  }
}