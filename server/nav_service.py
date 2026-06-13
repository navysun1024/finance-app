import http.server
import json
import logging
import os
import time
import akshare as ak
from urllib.parse import urlparse, parse_qs
from datetime import datetime

# 日志配置
LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOGS_DIR, 'nav-service.log')

logger = logging.getLogger('NavService')
logger.setLevel(logging.DEBUG)

# 文件 handler
fh = logging.FileHandler(LOG_FILE, encoding='utf-8')
fh.setLevel(logging.DEBUG)
fh.setFormatter(logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s', datefmt='%Y/%m/%d %H:%M:%S'))

# 控制台 handler
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
ch.setFormatter(logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s', datefmt='%Y/%m/%d %H:%M:%S'))

logger.addHandler(fh)
logger.addHandler(ch)


class NavHandler(http.server.BaseHTTPRequestHandler):

    def do_GET(self):
        start_time = time.time()
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        client_ip = self.client_address[0]

        logger.info(f"收到请求: {self.command} {self.path}, 来源: {client_ip}")

        if parsed.path == '/api/akshare/fund':
            self._handle_fund(params, start_time)
        elif parsed.path == '/api/akshare/fund_history':
            self._handle_fund_history(params, start_time)
        else:
            logger.warning(f"未知路径: {parsed.path}")
            self.send_json({"error": "未知路径", "available": ["/api/akshare/fund", "/api/akshare/fund_history"]}, 404)

    def _handle_fund(self, params, start_time):
        code = params.get('code', [''])[0]
        if not code:
            logger.warning(f"[fund] 缺少基金代码参数")
            self.send_json({"error": "缺少基金代码"}, 400)
            return

        logger.info(f"[fund] 查询基金净值, code: {code}")

        try:
            logger.debug(f"[fund] 调用 akshare 获取净值走势, code: {code}")
            hist = ak.fund_open_fund_info_em(symbol=code, indicator="单位净值走势", period="成立来")

            if hist is None or hist.empty:
                logger.warning(f"[fund] 基金 {code} 暂无数据")
                self.send_json({"error": f"基金 {code} 暂无数据"}, 404)
                return

            latest = hist.iloc[-1]
            first = hist.iloc[0]
            logger.debug(f"[fund] 获取到 {len(hist)} 条净值记录, code: {code}")

            result = {
                "success": True,
                "code": code,
                "name": "",
                "nav": float(latest.get('单位净值', 0) or 0),
                "date": str(latest.get('净值日期', '')),
                "total_records": len(hist),
                "total_return": round((float(latest.get('单位净值', 0) or 0) - float(first.get('单位净值', 0) or 0)) / float(first.get('单位净值', 0) or 1) * 100, 2),
                "first_nav": float(first.get('单位净值', 0) or 0),
                "first_date": str(first.get('净值日期', ''))
            }

            logger.debug(f"[fund] 调用 akshare 获取基金名称, code: {code}")
            info = ak.fund_name_em()
            fund_row = info[info['基金代码'] == code]
            if not fund_row.empty:
                result["name"] = fund_row.iloc[0].get('基金简称', '')
                logger.debug(f"[fund] 获取到基金名称: {result['name']}")

            elapsed = round((time.time() - start_time) * 1000, 1)
            logger.info(f"[fund] 查询成功, code: {code}, nav: {result['nav']}, name: {result['name']}, 耗时: {elapsed}ms")
            self.send_json(result)

        except Exception as e:
            elapsed = round((time.time() - start_time) * 1000, 1)
            logger.error(f"[fund] 查询异常, code: {code}, 耗时: {elapsed}ms, 错误: {e}", exc_info=True)
            self.send_json({"error": str(e)}, 500)

    def _handle_fund_history(self, params, start_time):
        code = params.get('code', [''])[0]
        if not code:
            logger.warning(f"[fund_history] 缺少基金代码参数")
            self.send_json({"error": "缺少基金代码"}, 400)
            return

        logger.info(f"[fund_history] 查询基金历史净值, code: {code}")

        try:
            logger.debug(f"[fund_history] 调用 akshare 获取净值走势, code: {code}")
            hist = ak.fund_open_fund_info_em(symbol=code, indicator="单位净值走势", period="成立来")

            if hist is None or hist.empty:
                logger.warning(f"[fund_history] 基金 {code} 暂无数据")
                self.send_json({"error": f"基金 {code} 暂无数据"}, 404)
                return

            records = []
            for _, row in hist.iterrows():
                records.append({
                    "date": str(row.get('净值日期', '')),
                    "nav": float(row.get('单位净值', 0) or 0),
                    "acc_nav": float(row.get('累计净值', 0) or 0) if row.get('累计净值') else None,
                    "daily_change": row.get('日增长率', '')
                })

            elapsed = round((time.time() - start_time) * 1000, 1)
            logger.info(f"[fund_history] 查询成功, code: {code}, 记录数: {len(records)}, 耗时: {elapsed}ms")
            self.send_json({"success": True, "code": code, "records": records, "total": len(records)})

        except Exception as e:
            elapsed = round((time.time() - start_time) * 1000, 1)
            logger.error(f"[fund_history] 查询异常, code: {code}, 耗时: {elapsed}ms, 错误: {e}", exc_info=True)
            self.send_json({"error": str(e)}, 500)

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        # 将 BaseHTTPRequestHandler 默认日志转为 logger 输出
        logger.debug(f"[HTTP] {args[0] if len(args) > 0 else ''} {args[1] if len(args) > 1 else ''} {args[2] if len(args) > 2 else ''}")


if __name__ == '__main__':
    port = 3003
    server = http.server.HTTPServer(('0.0.0.0', port), NavHandler)
    logger.info(f"AkShare 净值服务已启动: http://localhost:{port}")
    logger.info(f"  查询净值: http://localhost:{port}/api/akshare/fund?code=019455")
    logger.info(f"  查询历史: http://localhost:{port}/api/akshare/fund_history?code=019455")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("收到中断信号，正在关闭服务...")
        server.server_close()
        logger.info("净值服务已停止")
