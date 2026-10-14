package com.dudu.duduserver.channel.support;

/**
 * 契约 location 分支的经纬度解析：值为有限数值（types.ts 的 latitude/longitude:
 * number）。Double.parseDouble 对 "1e999"、"NaN" 返回非有限值而不抛异常，溢出
 * 坐标一旦落库，Jackson 会序列化为非数字字符串，Desk 解析层将按无效响应拒绝
 * 整页；统一在渠道边界抛出，由各 Protocol 的 unknown 兜底接住。
 */
public final class Coordinates {

    private Coordinates() {
    }

    // 非数字或溢出为非有限值都抛 NumberFormatException，与解析失败同一兜底路径
    public static double parse(String value) {
        double parsed = Double.parseDouble(value);
        if (!Double.isFinite(parsed)) {
            throw new NumberFormatException("坐标超出有限数值范围: " + value);
        }
        return parsed;
    }
}
