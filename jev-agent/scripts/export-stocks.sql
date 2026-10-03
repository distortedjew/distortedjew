-- DuckDB: build data/stocks.csv from prices.parquet + members.parquet (sp500-data release assets)
copy (
  select strftime(p.date, '%Y-%m-%d') as date, p.ticker,
         round(p.open*f,4) as open, round(p.high*f,4) as high, round(p.low*f,4) as low, round(p.adj_close,4) as close, p.volume,
         case when p.ticker='SPY' then 1 when exists (select 1 from 'members.parquet' m where m.ticker=p.ticker and m.start<=p.date and (m."end" is null or m."end">p.date)) then 1 else 0 end as member
  from (select *, case when close>0 then adj_close/close else 1 end as f from 'prices.parquet') p
  where p.date >= date '2006-01-01' and p.adj_close > 0 and p.volume > 0
    and (p.ticker='SPY' or p.ticker in (select ticker from 'members.parquet'))
  order by p.date, p.ticker
) to 'data/stocks.csv' (header);
