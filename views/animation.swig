{% extends 'layout.swig' %}

{% block title %}Animation - Kothique Chaturbate Backend{% endblock %}

{% block head %}
  <meta data-name="ws-port" data-content="{{ wsPort }}" />

  <style>
    #number {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      font-weight: bold;
      font-size: 50rem;
      color: purple;
      transition: opacity 500ms;
      opacity: 0;
    }
  </style>
{% endblock %}

{% block content %}
  <div id="number">12</div>

  <script src="/assets/animation.js"></script>
{% endblock %}
