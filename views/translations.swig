{% extends 'layout.swig' %}

{% block title %}Translations - Kothique Chaturbate Backend{% endblock %}

{% block head %}
  <meta data-name="ws-host" data-content="{{ wsHost }}" />
  <meta data-name="ws-port" data-content="{{ wsPort }}" />

  <style>
    #alert {
      color: orange;
      font-weight: bold;
    }
  </style>
{% endblock %}

{% block content %}
  <div class="title">Translations</div>

  <a href="/">home</a>

  <div id="alert"></div>

  {% for request in requests %}
    <div class="translation-request" data-msg-id="{{ request.msgId }}" data-tab-id="{{ request.tabId }}">
      <pre class="content">{{ request.content }}</pre>
      <textarea class="translation"></textarea>
      <a class="send-link" href="#">Send</a>
    </div>
  {% endfor %}

  <script src="/assets/translations.js"></script>
{% endblock %}
