(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var el = document.getElementById('chart-findings');
  if (!el || typeof echarts === 'undefined') return;

  var chart = echarts.init(el, null, { renderer: 'svg' });

  var categories = ['安全与鉴权', '业务逻辑', '工程质量', '界面与体验'];
  var high = [5, 2, 1, 0];
  var normal = [0, 3, 5, 4];

  chart.setOption({
    animation: false,
    color: [accent, accent2],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      appendToBody: true,
      backgroundColor: bg2,
      borderColor: rule,
      textStyle: { color: ink, fontSize: 12 }
    },
    legend: {
      data: ['P0 / P1', 'P2 / 建议'],
      bottom: 0,
      textStyle: { color: muted, fontSize: 12 },
      itemWidth: 12,
      itemHeight: 8
    },
    grid: { left: 96, right: 32, top: 16, bottom: 48 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: ink, fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: 'P0 / P1',
        type: 'bar',
        data: high,
        barWidth: 16,
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: ink, fontSize: 11 }
      },
      {
        name: 'P2 / 建议',
        type: 'bar',
        data: normal,
        barWidth: 16,
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: muted, fontSize: 11 }
      }
    ]
  });

  window.addEventListener('resize', function () { chart.resize(); });
})();
