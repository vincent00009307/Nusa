const BINANCE_BASE = "https://data-api.binance.vision";
const TWELVE_BASE = "https://api.twelvedata.com";
const ALLOWED_INTERVALS = new Set(["1min","5min","15min","30min","1h","2h","4h","8h","1day","1week"]);
const CRYPTO_SYMBOLS = new Set(["BTC/USD","ETH/USD","SOL/USD"]);
function json(res, status=200) { return new Response(JSON.stringify(res), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}); }
export default async function handler(req) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "BTC/USD").toUpperCase();
  const interval = url.searchParams.get("interval") || "1h";
  if (!ALLOWED_INTERVALS.has(interval)) return json({error:"Interval tidak didukung."},400);
  try {
    if (CRYPTO_SYMBOLS.has(symbol)) {
      const pair = symbol.replace("/","");
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
        currency:"$", updatedAt:new Date().toISOString(),
        candles:raw.map(k=>({time:new Date(Number(k[0])).toISOString(),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}))
      });
    }
    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) return json({error:"Feed "+symbol+" memerlukan TWELVEDATA_API_KEY. Tambahkan API key Twelve Data pada Environment Variables proyek Vercel."},503);
    const tdSymbol = symbol === "AAPL" ? "AAPL" : symbol;
    const [quoteResponse, seriesResponse] = await Promise.all([
      fetch(TWELVE_BASE+"/quote?symbol="+encodeURIComponent(tdSymbol)+"&apikey="+encodeURIComponent(apiKey),{cache:"no-store"}),
      fetch(TWELVE_BASE+"/time_series?symbol="+encodeURIComponent(tdSymbol)+"&interval="+encodeURIComponent(interval)+"&outputsize=80&apikey="+encodeURIComponent(apiKey),{cache:"no-store"})
    ]);
    const quote = await quoteResponse.json(), series = await seriesResponse.json();
    if (!quoteResponse.ok || !seriesResponse.ok || quote.status==="error" || series.status==="error" || !series.values) {
      const msg=quote.message||series.message||quote.code||series.code||"Penyedia data menolak permintaan. Periksa cakupan instrumen dan limit API.";
      return json({error:"Twelve Data: "+msg},502);
    }
    const values=series.values.slice().reverse();
    const price=Number(quote.close||values[values.length-1]?.close);
    return json({
      symbol, exchange:series.meta?.exchange||quote.exchange||"Twelve Data", provider:"Twelve Data API", interval,
      price, changePercent:Number(quote.percent_change||0), currency:symbol==="AAPL"?"$":"", updatedAt:new Date().toISOString(),
      candles:values.map(v=>({time:new Date(v.datetime).toISOString(),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.volume||0)}))
    });
  } catch (error) {
    return json({error:error instanceof Error?error.message:"Kesalahan saat mengambil data market."},502);
  }
}