package com.dudu.duduserver.channel.support;

import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 渠道回调 XML 报文的安全解析：公网报文一律禁止 DTD、XInclude 与外部实体引用
 * （XXE 防护底线，各渠道同一套，不随渠道分别配置）；flatFields 取根元素一级
 * 子元素的扁平键值（微信系报文格式：嵌套结构如 ScanCodeInfo 不参与消息体，
 * 文本不假设严格 CDATA 包裹），无法解析按参数错误拒绝，由调用方按 400 应答。
 */
public final class SecureXml {

    private SecureXml() {
    }

    public static DocumentBuilder builder() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder();
    }

    public static Map<String, String> flatFields(String xml) {
        Document document;
        try {
            document = builder().parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            throw new IllegalArgumentException("渠道回调报文无法解析", e);
        }
        Map<String, String> fields = new LinkedHashMap<>();
        NodeList children = document.getDocumentElement().getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            Node child = children.item(index);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                fields.put(child.getNodeName(), child.getTextContent());
            }
        }
        return fields;
    }
}
